import type { ActorType, ApplicationStatus } from '../../db/schema/enums.js';
import { AppError } from '../../shared/errors/app-error.js';
import { checkTransition, type ApplicationEventType } from './application-status.js';
import type {
  ApplicationsRepository,
  ApplicationStatusUpdate,
  LifecycleTransaction,
} from './applications.repository.js';

/**
 * Executes application status transitions. The ONLY way application status
 * changes after submission: admin review (Phase 5), scheduling (Phase 6) and
 * any future flow call `transition`, never a raw status update.
 *
 * Each transition, in one transaction holding a row lock on the application:
 * re-reads the current status, checks the move against the state machine
 * (application-status.ts), updates status and decision fields, and appends an
 * `application_events` row. Concurrent requests (two reviewers, a webhook
 * racing a reviewer) are therefore applied one at a time, and the loser gets a
 * 409 instead of silently overwriting the winner.
 *
 * Staff audit logging and notifications for these transitions belong to the
 * callers (Phase 5 / Phase 7).
 */

export interface TransitionActor {
  readonly type: ActorType;
  /** Required for STAFF (recorded as reviewer); optional otherwise. */
  readonly id?: string | undefined;
}

export interface TransitionRequest {
  readonly applicationId: string;
  readonly to: ApplicationStatus;
  readonly actor: TransitionActor;
  /** Only for REJECTED; optional until the business decides otherwise. */
  readonly rejectionReason?: string | undefined;
  /** Extra non-PII context for the lifecycle event. */
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface TransitionResult {
  readonly from: ApplicationStatus;
  readonly to: ApplicationStatus;
  readonly event: ApplicationEventType;
}

export interface ApplicationLifecycle {
  transition(request: TransitionRequest): Promise<TransitionResult>;
}

/**
 * Applies one validated transition inside an existing row-locked transaction.
 * Several calls may run in the same transaction (e.g. ACCEPTED then
 * SCHEDULING_OPEN); each re-checks against the status left by the previous
 * one. Throws AppError 409/403/400 without writing anything for this step.
 */
export async function applyTransition(
  tx: LifecycleTransaction,
  request: Omit<TransitionRequest, 'applicationId'>,
  at: Date,
): Promise<TransitionResult> {
  const { to, actor, rejectionReason } = request;
  if (actor.type === 'STAFF' && !actor.id) {
    throw new Error('STAFF transitions require the staff user id');
  }
  if (rejectionReason !== undefined && to !== 'REJECTED') {
    throw new AppError(400, 'VALIDATION_ERROR', 'A reason can only be given when rejecting.', [
      { location: 'body', path: '/reason', message: 'only allowed when rejecting' },
    ]);
  }

  const from = tx.application.status;
  const check = checkTransition(from, to, actor.type);
  if (!check.ok) {
    if (check.reason === 'ACTOR_NOT_ALLOWED') {
      throw new AppError(403, 'FORBIDDEN', 'You are not allowed to make this change.');
    }
    throw new AppError(409, 'CONFLICT', `An application cannot move from ${from} to ${to}.`);
  }

  const update: {
    -readonly [K in keyof ApplicationStatusUpdate]: ApplicationStatusUpdate[K];
  } = { status: to };
  if (to === 'ACCEPTED' || to === 'REJECTED') {
    update.reviewedAt = at;
    if (actor.id) update.reviewedBy = actor.id;
  }
  if (to === 'ACCEPTED') update.acceptedAt = at;
  if (to === 'REJECTED' && rejectionReason !== undefined) {
    update.rejectionReason = rejectionReason;
  }

  await tx.updateStatus(update);
  await tx.insertEvent({
    applicationId: tx.application.id,
    eventType: check.rule.event,
    actorType: actor.type,
    actorId: actor.id ?? null,
    metadata: { ...request.metadata, from, to },
  });
  return { from, to, event: check.rule.event };
}

export function createApplicationLifecycle(deps: {
  repository: Pick<ApplicationsRepository, 'withApplicationLock'>;
  now?: () => Date;
}): ApplicationLifecycle {
  const { repository } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    async transition(request) {
      const result = await repository.withApplicationLock(request.applicationId, (tx) =>
        applyTransition(tx, request, now()),
      );
      if (!result) throw new AppError(404, 'NOT_FOUND', 'Application not found.');
      return result;
    },
  };
}
