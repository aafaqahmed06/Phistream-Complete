import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, id, lengthBetween, oneOf, updatedAt } from './columns.js';
import { STAFF_ROLES } from './enums.js';

/** Staff/admin identities (admin module). Authentication itself is external. */
export const staffUsers = pgTable(
  'staff_users',
  {
    id: id(),
    /** Subject ID from the auth provider (e.g. Supabase Auth user id). */
    authProviderId: text('auth_provider_id').notNull(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    role: text('role', { enum: STAFF_ROLES }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('staff_users_auth_provider_id_key').on(t.authProviderId),
    uniqueIndex('staff_users_email_lower_key').on(sql`lower(${t.email})`),
    check('staff_users_role_valid', oneOf(t.role, STAFF_ROLES)),
    check('staff_users_email_format', sql`${t.email} ~ '^[^@\\s]+@[^@\\s]+$'`),
    check('staff_users_display_name_length', lengthBetween(t.displayName, 1, 200)),
  ],
).enableRLS();

/**
 * Security-relevant administrative actions. Rows are append-only by
 * convention (no update/delete code paths). `entity_id` is polymorphic, so it
 * has no foreign key; `actor_id` is null for system actions.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    actorId: uuid('actor_id').references(() => staffUsers.id, { onDelete: 'restrict' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_created_at_idx').on(t.createdAt),
    index('audit_logs_actor_id_idx').on(t.actorId),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    check('audit_logs_action_format', sql`${t.action} ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)*$'`),
    check('audit_logs_entity_type_format', sql`${t.entityType} ~ '^[a-z][a-z0-9_]*$'`),
    check(
      'audit_logs_metadata_is_object',
      sql`${t.metadata} is null or jsonb_typeof(${t.metadata}) = 'object'`,
    ),
  ],
).enableRLS();
