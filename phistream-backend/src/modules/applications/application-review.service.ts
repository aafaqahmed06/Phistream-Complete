import type { ApplicationStatus } from '../../db/schema/enums.js';
import { AppError } from '../../shared/errors/app-error.js';
import { applyTransition } from './application-lifecycle.js';
import type { ApplicationEventType } from './application-status.js';
import type { ApplicationsRepository, LifecycleTransaction } from './applications.repository.js';

/**
 * Staff review actions. Each action is ONE transaction holding a row lock on
 * the application, containing: the state transition(s) and their lifecycle
 * events, the audit log entry, and any notification-outbox event. Either all
 * of it is recorded or none of it (e.g. a failed audit insert rolls back the
 * decision). External providers are never called inside the transaction:
 * email (Phase 7) and scheduling access (Phase 6) are driven from the outbox
 * and lifecycle events after commit.
 *
 *   startReview: NEW → UNDER_REVIEW
 *   accept:      UNDER_REVIEW → ACCEPTED → SCHEDULING_OPEN
 *                (acceptance makes the applicant eligible to schedule: the
 *                SYSTEM step records SCHEDULING_ENABLED; the scheduling
 *                provider issues the actual booking access in Phase 6)
 *   reject:      UNDER_REVIEW → REJECTED (optional internal reason)
 *   addNote:     internal note, any status
 */

export interface ReviewActor {
  readonly staffId: string;
}

export interface ReviewResult {
  readonly status: ApplicationStatus;
  readonly events: ApplicationEventType[];
}

export interface AddedNote {
  readonly id: string;
  readonly createdAt: Date;
}

export interface ApplicationReviewService {
  startReview(applicationId: string, actor: ReviewActor): Promise<ReviewResult>;
  accept(applicationId: string, actor: ReviewActor): Promise<ReviewResult>;
  reject(applicationId: string, actor: ReviewActor, reason?: string): Promise<ReviewResult>;
  addNote(applicationId: string, actor: ReviewActor, body: string): Promise<AddedNote>;
}

const notFound = () => new AppError(404, 'NOT_FOUND', 'Application not found.');

export function createApplicationReviewService(deps: {
  repository: Pick<ApplicationsRepository, 'withApplicationLock'>;
  now?: () => Date;
}): ApplicationReviewService {
  const { repository } = deps;
  const now = deps.now ?? (() => new Date());

  async function locked<T>(
    applicationId: string,
    work: (tx: LifecycleTransaction) => Promise<T>,
  ): Promise<T> {
    const result = await repository.withApplicationLock(applicationId, work);
    if (result === undefined) throw notFound();
    return result;
  }

  return {
    startReview(applicationId, actor) {
      return locked(applicationId, async (tx) => {
        const staff = { type: 'STAFF', id: actor.staffId } as const;
        const step = await applyTransition(tx, { to: 'UNDER_REVIEW', actor: staff }, now());
        await tx.insertAuditLog({
          actorId: actor.staffId,
          action: 'application.review_started',
          entityType: 'application',
          entityId: applicationId,
          metadata: { from: step.from, to: step.to },
        });
        return { status: step.to, events: [step.event] };
      });
    },

    accept(applicationId, actor) {
      return locked(applicationId, async (tx) => {
        const at = now();
        const accepted = await applyTransition(
          tx,
          { to: 'ACCEPTED', actor: { type: 'STAFF', id: actor.staffId } },
          at,
        );
        const enabled = await applyTransition(
          tx,
          {
            to: 'SCHEDULING_OPEN',
            actor: { type: 'SYSTEM' },
            metadata: { trigger: 'accepted', acceptedBy: actor.staffId },
          },
          at,
        );
        await tx.insertAuditLog({
          actorId: actor.staffId,
          action: 'application.accepted',
          entityType: 'application',
          entityId: applicationId,
          metadata: { from: accepted.from, to: enabled.to },
        });
        await tx.enqueueNotificationEvent({
          eventType: 'APPLICATION_ACCEPTED',
          subjectType: 'application',
          subjectId: applicationId,
        });
        return { status: enabled.to, events: [accepted.event, enabled.event] };
      });
    },

    reject(applicationId, actor, reason) {
      return locked(applicationId, async (tx) => {
        const step = await applyTransition(
          tx,
          {
            to: 'REJECTED',
            actor: { type: 'STAFF', id: actor.staffId },
            ...(reason !== undefined ? { rejectionReason: reason } : {}),
          },
          now(),
        );
        await tx.insertAuditLog({
          actorId: actor.staffId,
          action: 'application.rejected',
          entityType: 'application',
          entityId: applicationId,
          // Whether a reason was given, never the reason itself.
          metadata: { from: step.from, to: step.to, reasonProvided: reason !== undefined },
        });
        await tx.enqueueNotificationEvent({
          eventType: 'APPLICATION_REJECTED',
          subjectType: 'application',
          subjectId: applicationId,
        });
        return { status: step.to, events: [step.event] };
      });
    },

    addNote(applicationId, actor, body) {
      return locked(applicationId, async (tx) => {
        const note = await tx.insertNote({ authorId: actor.staffId, body });
        await tx.insertAuditLog({
          actorId: actor.staffId,
          action: 'application.note_added',
          entityType: 'application',
          entityId: applicationId,
          metadata: { noteId: note.id },
        });
        return note;
      });
    },
  };
}
