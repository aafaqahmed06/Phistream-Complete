import { sql } from 'drizzle-orm';

import type { DbExecutor } from '../../db/client.js';
import { auditLogs } from '../../db/schema/index.js';

/**
 * Security audit trail for state-changing staff/administrative actions.
 *
 * Write the entry with the same transaction as the change it records, so an
 * action is audited if and only if it happened. Rows are append-only (there is
 * no update/delete path). Metadata holds identifiers and classifications only:
 * never note bodies, rejection reasons, answers, or contact details.
 */
export const AUDIT_ACTIONS = [
  'application.review_started',
  'application.accepted',
  'application.rejected',
  'application.note_added',
  'application.scheduling_access_issued',
  'notification.requeued',
  'lead.erased',
  'retention.applied',
  'staff.added',
  'staff.activated',
  'staff.deactivated',
  'staff.role_changed',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TYPES = [
  'application',
  'staff_user',
  'notification_event',
  'lead',
  'system',
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export interface AuditLogEntry {
  /** Staff user who acted; null for system/CLI actions. */
  readonly actorId: string | null;
  readonly action: AuditAction;
  readonly entityType: AuditEntityType;
  readonly entityId: string | null;
  readonly metadata?: Record<string, unknown> | undefined;
}

export async function insertAuditLog(executor: DbExecutor, entry: AuditLogEntry): Promise<void> {
  await executor.insert(auditLogs).values({
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: entry.metadata ?? null,
    // Wall-clock time: several entries in one transaction stay ordered.
    createdAt: sql`clock_timestamp()`,
  });
}
