import { describe, expect, it } from 'vitest';

import {
  ACTOR_TYPES,
  APPLICATION_STATUSES,
  type ActorType,
  type ApplicationStatus,
} from '../../src/db/schema/enums.js';
import {
  APPLICATION_EVENT_TYPES,
  APPLICATION_TRANSITIONS,
  checkTransition,
  isTerminalStatus,
  PUBLIC_APPLICATION_STATUSES,
  toPublicStatus,
} from '../../src/modules/applications/application-status.js';

/**
 * The complete list of allowed moves, written out independently of the
 * implementation (ARCHITECTURE.md › Application state machine plus the
 * operational states). Every (from, to, actor) combination NOT listed here must
 * be rejected, so the matrix below covers 11 × 11 × 4 = 484 cases.
 */
const ALLOWED: Readonly<Record<string, readonly ActorType[]>> = {
  'NEW>UNDER_REVIEW': ['STAFF'],
  'NEW>WITHDRAWN': ['APPLICANT', 'STAFF'],
  'NEW>ARCHIVED': ['STAFF'],
  'UNDER_REVIEW>ACCEPTED': ['STAFF'],
  'UNDER_REVIEW>REJECTED': ['STAFF'],
  'UNDER_REVIEW>WITHDRAWN': ['APPLICANT', 'STAFF'],
  'UNDER_REVIEW>ARCHIVED': ['STAFF'],
  'ACCEPTED>SCHEDULING_OPEN': ['SYSTEM', 'STAFF'],
  'ACCEPTED>WITHDRAWN': ['APPLICANT', 'STAFF'],
  'ACCEPTED>ARCHIVED': ['STAFF'],
  'SCHEDULING_OPEN>SCHEDULED': ['PROVIDER', 'STAFF'],
  'SCHEDULING_OPEN>WITHDRAWN': ['APPLICANT', 'STAFF'],
  'SCHEDULING_OPEN>ARCHIVED': ['STAFF'],
  'SCHEDULED>COMPLETED': ['STAFF'],
  'SCHEDULED>NO_SHOW': ['STAFF'],
  'SCHEDULED>SCHEDULING_OPEN': ['PROVIDER', 'STAFF'],
  'SCHEDULED>WITHDRAWN': ['APPLICANT', 'STAFF'],
  'SCHEDULED>ARCHIVED': ['STAFF'],
  'NO_SHOW>SCHEDULING_OPEN': ['STAFF'],
  'NO_SHOW>ARCHIVED': ['STAFF'],
  'COMPLETED>CONVERTED': ['STAFF'],
  'COMPLETED>ARCHIVED': ['STAFF'],
  'REJECTED>ARCHIVED': ['STAFF'],
  'WITHDRAWN>ARCHIVED': ['STAFF'],
  'CONVERTED>ARCHIVED': ['STAFF'],
};

const combos = APPLICATION_STATUSES.flatMap((from) =>
  APPLICATION_STATUSES.flatMap((to) => ACTOR_TYPES.map((actor) => [from, to, actor] as const)),
);

describe('application state machine', () => {
  it('lists exactly the documented transitions', () => {
    const implemented = Object.fromEntries(
      APPLICATION_STATUSES.flatMap((from) =>
        APPLICATION_TRANSITIONS[from].map((rule) => [
          `${from}>${rule.to}`,
          [...rule.actors].sort(),
        ]),
      ),
    );
    const expected = Object.fromEntries(
      Object.entries(ALLOWED).map(([key, actors]) => [key, [...actors].sort()]),
    );
    expect(implemented).toEqual(expected);
  });

  it.each(combos)('%s → %s by %s', (from, to, actor) => {
    const allowedActors = ALLOWED[`${from}>${to}`];
    const result = checkTransition(from, to, actor);

    if (allowedActors?.includes(actor)) {
      expect(result.ok).toBe(true);
    } else if (allowedActors) {
      expect(result).toEqual({ ok: false, reason: 'ACTOR_NOT_ALLOWED' });
    } else {
      expect(result).toEqual({ ok: false, reason: 'NOT_ALLOWED' });
    }
  });

  describe('business-critical invalid moves', () => {
    it.each<[ApplicationStatus, ApplicationStatus]>([
      ['NEW', 'ACCEPTED'], // cannot skip review
      ['NEW', 'REJECTED'],
      ['NEW', 'SCHEDULING_OPEN'], // no scheduling without acceptance
      ['NEW', 'SCHEDULED'],
      ['UNDER_REVIEW', 'SCHEDULING_OPEN'],
      ['UNDER_REVIEW', 'SCHEDULED'],
      ['REJECTED', 'ACCEPTED'], // decisions are final
      ['REJECTED', 'UNDER_REVIEW'],
      ['REJECTED', 'SCHEDULING_OPEN'],
      ['ACCEPTED', 'REJECTED'],
      ['ACCEPTED', 'UNDER_REVIEW'],
      ['ACCEPTED', 'SCHEDULED'], // scheduling must be enabled first
      ['WITHDRAWN', 'UNDER_REVIEW'],
      ['WITHDRAWN', 'ACCEPTED'],
      ['COMPLETED', 'SCHEDULED'],
      ['CONVERTED', 'COMPLETED'],
      ['NO_SHOW', 'SCHEDULED'],
      ['NO_SHOW', 'WITHDRAWN'],
      ['REJECTED', 'WITHDRAWN'],
      ['COMPLETED', 'WITHDRAWN'],
    ])('%s → %s is never allowed', (from, to) => {
      for (const actor of ACTOR_TYPES) {
        expect(checkTransition(from, to, actor).ok).toBe(false);
      }
    });

    it('never allows a status to transition to itself', () => {
      for (const status of APPLICATION_STATUSES) {
        for (const actor of ACTOR_TYPES)
          expect(checkTransition(status, status, actor).ok).toBe(false);
      }
    });

    it('never lets a transition leave ARCHIVED', () => {
      expect(isTerminalStatus('ARCHIVED')).toBe(true);
      for (const to of APPLICATION_STATUSES) {
        for (const actor of ACTOR_TYPES)
          expect(checkTransition('ARCHIVED', to, actor).ok).toBe(false);
      }
    });

    it('lets only staff make review decisions', () => {
      for (const to of ['UNDER_REVIEW', 'ACCEPTED', 'REJECTED'] as const) {
        const from = to === 'UNDER_REVIEW' ? 'NEW' : 'UNDER_REVIEW';
        for (const actor of ['APPLICANT', 'SYSTEM', 'PROVIDER'] as const) {
          expect(checkTransition(from, to, actor)).toEqual({
            ok: false,
            reason: 'ACTOR_NOT_ALLOWED',
          });
        }
      }
    });

    it('lets applicants withdraw, but not after a final outcome', () => {
      for (const from of APPLICATION_STATUSES) {
        const allowed = checkTransition(from, 'WITHDRAWN', 'APPLICANT').ok;
        expect(allowed, from).toBe(
          ['NEW', 'UNDER_REVIEW', 'ACCEPTED', 'SCHEDULING_OPEN', 'SCHEDULED'].includes(from),
        );
      }
    });
  });

  it('only non-archived states can be archived, and only by staff', () => {
    for (const from of APPLICATION_STATUSES) {
      expect(checkTransition(from, 'ARCHIVED', 'STAFF').ok, from).toBe(from !== 'ARCHIVED');
    }
  });

  it('uses known event types for every rule', () => {
    for (const rules of Object.values(APPLICATION_TRANSITIONS)) {
      for (const rule of rules) expect(APPLICATION_EVENT_TYPES).toContain(rule.event);
    }
  });

  describe('public status', () => {
    it('maps every internal status to a public one', () => {
      for (const status of APPLICATION_STATUSES) {
        expect(PUBLIC_APPLICATION_STATUSES).toContain(toPublicStatus(status));
      }
    });

    it('hides internal states', () => {
      expect(toPublicStatus('NEW')).toBe('UNDER_REVIEW');
      expect(toPublicStatus('SCHEDULING_OPEN')).toBe('ACCEPTED');
      expect(toPublicStatus('NO_SHOW')).toBe('ACCEPTED');
      expect(toPublicStatus('CONVERTED')).toBe('CLOSED');
      expect(toPublicStatus('ARCHIVED')).toBe('CLOSED');
      expect(toPublicStatus('REJECTED')).toBe('NOT_ACCEPTED');
    });
  });
});
