import { describe, expect, it } from 'vitest';

import type { ApplicationStatus } from '../../src/db/schema/enums.js';
import { createApplicationLifecycle } from '../../src/modules/applications/application-lifecycle.js';
import { createFakeApplicationsRepository } from '../helpers/fake-applications.js';

const STAFF = { type: 'STAFF', id: '00000000-0000-4000-8000-000000000501' } as const;
const NOW = new Date('2026-06-01T09:00:00Z');

function setup(status: ApplicationStatus = 'NEW') {
  const fake = createFakeApplicationsRepository();
  const id = '00000000-0000-4000-8000-000000000701';
  fake.state.applications.push({
    id,
    reference: 'PHI-2026-AAAAAA',
    leadId: '00000000-0000-4000-8000-000000000601',
    serviceTierId: null,
    formVersion: 'v1',
    submissionFingerprint: null,
    status,
    submittedAt: NOW,
    createdAt: NOW,
  });
  const lifecycle = createApplicationLifecycle({ repository: fake.repository, now: () => NOW });
  return { ...fake, lifecycle, id, application: fake.state.applications[0]! };
}

describe('application lifecycle', () => {
  it('walks the happy path, recording one event per step', async () => {
    const { lifecycle, id, application, state } = setup();
    const steps = [
      ['UNDER_REVIEW', STAFF],
      ['ACCEPTED', STAFF],
      ['SCHEDULING_OPEN', { type: 'SYSTEM' }],
      ['SCHEDULED', { type: 'PROVIDER' }],
      ['COMPLETED', STAFF],
      ['CONVERTED', STAFF],
      ['ARCHIVED', STAFF],
    ] as const;

    for (const [to, actor] of steps) await lifecycle.transition({ applicationId: id, to, actor });

    expect(application.status).toBe('ARCHIVED');
    expect(state.events.map((e) => e.eventType)).toEqual([
      'REVIEW_STARTED',
      'ACCEPTED',
      'SCHEDULING_ENABLED',
      'BOOKING_CREATED',
      'MEETING_COMPLETED',
      'CONVERTED',
      'ARCHIVED',
    ]);
    expect(state.events[1]).toEqual({
      applicationId: id,
      eventType: 'ACCEPTED',
      actorType: 'STAFF',
      actorId: STAFF.id,
      metadata: { from: 'UNDER_REVIEW', to: 'ACCEPTED' },
    });
  });

  it('records reviewer and timestamps on acceptance', async () => {
    const { lifecycle, id, application } = setup('UNDER_REVIEW');
    await lifecycle.transition({ applicationId: id, to: 'ACCEPTED', actor: STAFF });

    expect(application).toMatchObject({ reviewedAt: NOW, reviewedBy: STAFF.id, acceptedAt: NOW });
  });

  it('records the rejection reason, and keeps it when archived', async () => {
    const { lifecycle, id, application } = setup('UNDER_REVIEW');
    await lifecycle.transition({
      applicationId: id,
      to: 'REJECTED',
      actor: STAFF,
      rejectionReason: 'Not a fit right now',
    });
    expect(application).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Not a fit right now',
      reviewedBy: STAFF.id,
    });
    expect(application.acceptedAt).toBeUndefined();

    await lifecycle.transition({ applicationId: id, to: 'ARCHIVED', actor: STAFF });
    expect(application).toMatchObject({
      status: 'ARCHIVED',
      rejectionReason: 'Not a fit right now',
    });
  });

  it('rejects an invalid move with 409 and changes nothing', async () => {
    const { lifecycle, id, application, state } = setup('NEW');
    await expect(
      lifecycle.transition({ applicationId: id, to: 'ACCEPTED', actor: STAFF }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });

    expect(application.status).toBe('NEW');
    expect(state.events).toEqual([]);
  });

  it('rejects a disallowed actor with 403', async () => {
    const { lifecycle, id } = setup('UNDER_REVIEW');
    await expect(
      lifecycle.transition({ applicationId: id, to: 'ACCEPTED', actor: { type: 'APPLICANT' } }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('rejects a reason on anything but a rejection', async () => {
    const { lifecycle, id } = setup('UNDER_REVIEW');
    await expect(
      lifecycle.transition({
        applicationId: id,
        to: 'ACCEPTED',
        actor: STAFF,
        rejectionReason: 'x',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
  });

  it('requires a staff id for staff transitions', async () => {
    const { lifecycle, id } = setup('NEW');
    await expect(
      lifecycle.transition({ applicationId: id, to: 'UNDER_REVIEW', actor: { type: 'STAFF' } }),
    ).rejects.toThrow('staff user id');
  });

  it('404s an unknown application', async () => {
    const { lifecycle } = setup();
    await expect(
      lifecycle.transition({
        applicationId: '00000000-0000-4000-8000-000000000999',
        to: 'UNDER_REVIEW',
        actor: STAFF,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('applies concurrent decisions one at a time: the second sees the first', async () => {
    const { lifecycle, id, application, state } = setup('UNDER_REVIEW');
    const results = await Promise.allSettled([
      lifecycle.transition({ applicationId: id, to: 'ACCEPTED', actor: STAFF }),
      lifecycle.transition({ applicationId: id, to: 'REJECTED', actor: STAFF }),
    ]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect(application.status).toBe('ACCEPTED');
    expect(state.events).toHaveLength(1);
  });
});
