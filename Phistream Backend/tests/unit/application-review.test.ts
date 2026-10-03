import { describe, expect, it } from 'vitest';

import type { ApplicationStatus } from '../../src/db/schema/enums.js';
import { createApplicationReviewService } from '../../src/modules/applications/application-review.service.js';
import { createFakeApplicationsRepository } from '../helpers/fake-applications.js';

const STAFF_ID = '00000000-0000-4000-8000-000000000501';
const APP_ID = '00000000-0000-4000-8000-000000000701';
const NOW = new Date('2026-06-01T09:00:00Z');
const actor = { staffId: STAFF_ID };

function setup(status: ApplicationStatus) {
  const fake = createFakeApplicationsRepository();
  fake.state.applications.push({
    id: APP_ID,
    reference: 'PHI-2026-AAAAAA',
    leadId: '00000000-0000-4000-8000-000000000601',
    serviceTierId: null,
    formVersion: 'v1',
    submissionFingerprint: null,
    status,
    submittedAt: NOW,
    createdAt: NOW,
  });
  const review = createApplicationReviewService({ repository: fake.repository, now: () => NOW });
  return { ...fake, review, application: fake.state.applications[0]! };
}

describe('application review service', () => {
  it('startReview: NEW → UNDER_REVIEW with event and audit entry', async () => {
    const { review, state, application } = setup('NEW');

    expect(await review.startReview(APP_ID, actor)).toEqual({
      status: 'UNDER_REVIEW',
      events: ['REVIEW_STARTED'],
    });
    expect(application.status).toBe('UNDER_REVIEW');
    expect(state.auditLogs).toEqual([
      {
        actorId: STAFF_ID,
        action: 'application.review_started',
        entityType: 'application',
        entityId: APP_ID,
        metadata: { from: 'NEW', to: 'UNDER_REVIEW' },
      },
    ]);
    expect(state.notifications).toEqual([]);
  });

  it('accept: records the decision and enables scheduling in one step', async () => {
    const { review, state, application } = setup('UNDER_REVIEW');

    expect(await review.accept(APP_ID, actor)).toEqual({
      status: 'SCHEDULING_OPEN',
      events: ['ACCEPTED', 'SCHEDULING_ENABLED'],
    });
    expect(application).toMatchObject({
      status: 'SCHEDULING_OPEN',
      reviewedBy: STAFF_ID,
      reviewedAt: NOW,
      acceptedAt: NOW,
    });
    expect(state.events).toEqual([
      {
        applicationId: APP_ID,
        eventType: 'ACCEPTED',
        actorType: 'STAFF',
        actorId: STAFF_ID,
        metadata: { from: 'UNDER_REVIEW', to: 'ACCEPTED' },
      },
      {
        applicationId: APP_ID,
        eventType: 'SCHEDULING_ENABLED',
        actorType: 'SYSTEM',
        actorId: null,
        metadata: {
          trigger: 'accepted',
          acceptedBy: STAFF_ID,
          from: 'ACCEPTED',
          to: 'SCHEDULING_OPEN',
        },
      },
    ]);
    expect(state.auditLogs).toEqual([
      expect.objectContaining({
        action: 'application.accepted',
        actorId: STAFF_ID,
        metadata: { from: 'UNDER_REVIEW', to: 'SCHEDULING_OPEN' },
      }),
    ]);
    expect(state.notifications).toEqual([
      { eventType: 'APPLICATION_ACCEPTED', subjectType: 'application', subjectId: APP_ID },
    ]);
  });

  it('reject: stores the reason, but the audit log only records that one was given', async () => {
    const { review, state, application } = setup('UNDER_REVIEW');
    await review.reject(APP_ID, actor, 'Audience too small for now');

    expect(application).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Audience too small for now',
    });
    expect(state.auditLogs[0]?.metadata).toEqual({
      from: 'UNDER_REVIEW',
      to: 'REJECTED',
      reasonProvided: true,
    });
    expect(JSON.stringify(state.auditLogs)).not.toContain('Audience too small');
    expect(state.notifications).toEqual([
      { eventType: 'APPLICATION_REJECTED', subjectType: 'application', subjectId: APP_ID },
    ]);
  });

  it('reject without a reason', async () => {
    const { review, state, application } = setup('UNDER_REVIEW');
    await review.reject(APP_ID, actor);

    expect(application.rejectionReason).toBeUndefined();
    expect(state.auditLogs[0]?.metadata).toMatchObject({ reasonProvided: false });
  });

  it('addNote: stores the note and audits its id, not its body', async () => {
    const { review, state } = setup('ARCHIVED');
    const note = await review.addNote(APP_ID, actor, 'Great portfolio; follow up re pricing.');

    expect(state.notes).toEqual([
      {
        id: note.id,
        applicationId: APP_ID,
        authorId: STAFF_ID,
        body: 'Great portfolio; follow up re pricing.',
        createdAt: note.createdAt,
      },
    ]);
    expect(state.auditLogs).toEqual([
      expect.objectContaining({ action: 'application.note_added', metadata: { noteId: note.id } }),
    ]);
    expect(JSON.stringify(state.auditLogs)).not.toContain('portfolio');
  });

  describe('invalid transitions change nothing', () => {
    const cases: [string, ApplicationStatus, (s: ReturnType<typeof setup>) => Promise<unknown>][] =
      [
        [
          'review an UNDER_REVIEW application',
          'UNDER_REVIEW',
          (s) => s.review.startReview(APP_ID, actor),
        ],
        ['review an ACCEPTED application', 'ACCEPTED', (s) => s.review.startReview(APP_ID, actor)],
        [
          'accept a NEW application (skipping review)',
          'NEW',
          (s) => s.review.accept(APP_ID, actor),
        ],
        ['accept a REJECTED application', 'REJECTED', (s) => s.review.accept(APP_ID, actor)],
        ['accept twice', 'SCHEDULING_OPEN', (s) => s.review.accept(APP_ID, actor)],
        ['accept a WITHDRAWN application', 'WITHDRAWN', (s) => s.review.accept(APP_ID, actor)],
        ['accept an ARCHIVED application', 'ARCHIVED', (s) => s.review.accept(APP_ID, actor)],
        ['reject a NEW application', 'NEW', (s) => s.review.reject(APP_ID, actor)],
        [
          'reject an accepted application',
          'SCHEDULING_OPEN',
          (s) => s.review.reject(APP_ID, actor),
        ],
        ['reject twice', 'REJECTED', (s) => s.review.reject(APP_ID, actor, 'again')],
        ['reject a SCHEDULED application', 'SCHEDULED', (s) => s.review.reject(APP_ID, actor)],
      ];

    it.each(cases)('cannot %s (409)', async (_, status, act) => {
      const ctx = setup(status);
      await expect(act(ctx)).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });

      expect(ctx.application.status).toBe(status);
      expect([ctx.state.events, ctx.state.auditLogs, ctx.state.notifications]).toEqual([
        [],
        [],
        [],
      ]);
    });
  });

  it('rolls back the decision when the audit entry cannot be written', async () => {
    const { review, state, application } = setup('UNDER_REVIEW');
    state.failNextAuditInsert = true;

    await expect(review.accept(APP_ID, actor)).rejects.toThrow('audit insert failed');
    expect(application.status).toBe('UNDER_REVIEW');
    expect(application.acceptedAt).toBeUndefined();
    expect([state.events, state.auditLogs, state.notifications]).toEqual([[], [], []]);
  });

  it('404s unknown applications for every action', async () => {
    const { review } = setup('NEW');
    const missing = '00000000-0000-4000-8000-000000000999';
    for (const act of [
      () => review.startReview(missing, actor),
      () => review.accept(missing, actor),
      () => review.reject(missing, actor),
      () => review.addNote(missing, actor, 'x'),
    ]) {
      await expect(act()).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    }
  });

  it('lets exactly one of two racing decisions win', async () => {
    const { review, state, application } = setup('UNDER_REVIEW');
    const results = await Promise.allSettled([
      review.accept(APP_ID, actor),
      review.reject(APP_ID, actor),
    ]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect(application.status).toBe('SCHEDULING_OPEN');
    expect(state.auditLogs).toHaveLength(1);
  });
});
