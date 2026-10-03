import { z } from 'zod';

import {
  ACTOR_TYPES,
  APPLICATION_STATUSES,
  LEAD_STATUSES,
  MEETING_STATUSES,
  NOTIFICATION_EVENT_STATUSES,
  NOTIFICATION_STATUSES,
  STAFF_ROLES,
} from '../../db/schema/enums.js';
import { multiLineText, optional } from '../../shared/validation/fields.js';
import { APPLICATION_EVENT_TYPES } from '../applications/application-status.js';
import { paginationQuerySchema, paginationSchema } from '../content/content.schemas.js';
import { NOTIFICATION_EVENT_TYPES } from '../notifications/notification-outbox.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from './audit-log.js';
import { ADMIN_APPLICATION_ACTIONS } from './admin.service.js';

/**
 * Admin API contract. Query strings are strict (unknown parameters are
 * rejected, so a typo cannot silently drop a filter). Dates are ISO 8601 with
 * an explicit offset; ranges are [from, to).
 */

const isoInstant = z.iso
  .datetime({ offset: true, error: 'must be an ISO 8601 date-time with timezone' })
  .transform((value) => new Date(value));

const filterText = z.string().trim().min(1).max(100);

function rangeCheck(fromKey: string, toKey: string) {
  return (query: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const from = query[fromKey];
    const to = query[toKey];
    if (from instanceof Date && to instanceof Date && from >= to) {
      ctx.addIssue({ code: 'custom', path: [toKey], message: `must be after ${fromKey}` });
    }
  };
}

// ---- Requests ----------------------------------------------------------------------

export const leadListQuerySchema = z
  .strictObject({
    ...paginationQuerySchema.shape,
    status: z.enum(LEAD_STATUSES).optional(),
    source: filterText.toLowerCase().optional(),
    campaign: filterText.toLowerCase().optional(),
    createdFrom: isoInstant.optional(),
    createdTo: isoInstant.optional(),
    search: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .optional()
      .describe('Case-insensitive substring of email, name, or company'),
  })
  .superRefine(rangeCheck('createdFrom', 'createdTo'));

export const applicationListQuerySchema = z
  .strictObject({
    ...paginationQuerySchema.shape,
    status: z.enum(APPLICATION_STATUSES).optional(),
    serviceTierId: z.uuid().optional(),
    source: filterText.toLowerCase().optional().describe("Lead's acquisition source"),
    submittedFrom: isoInstant.optional(),
    submittedTo: isoInstant.optional(),
  })
  .superRefine(rangeCheck('submittedFrom', 'submittedTo'));

export const auditLogListQuerySchema = z
  .strictObject({
    ...paginationQuerySchema.shape,
    action: z.enum(AUDIT_ACTIONS).optional(),
    entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
    entityId: z.uuid().optional(),
    actorId: z.uuid().optional(),
    from: isoInstant.optional(),
    to: isoInstant.optional(),
  })
  .superRefine(rangeCheck('from', 'to'));

export const applicationIdParamsSchema = z.object({ id: z.uuid() });
export const leadIdParamsSchema = z.object({ id: z.uuid() });

export const leadErasedResponseSchema = z
  .object({
    data: z.object({
      id: z.uuid(),
      erased: z.literal(true),
      removed: z.object({
        applications: z.number().int(),
        contactSubmissions: z.number().int(),
        notificationEvents: z.number().int(),
      }),
    }),
  })
  .meta({ id: 'AdminLeadErased' });

export const rejectBodySchema = z
  .strictObject({
    reason: optional(multiLineText(1, 5000)).describe(
      'Internal reason (never shown to the applicant). Optional.',
    ),
  })
  // Fastify passes null for a POST without a body.
  .nullish();

export const noteBodySchema = z.strictObject({
  body: multiLineText(1, 10_000).describe('Internal note (never shown to the applicant)'),
});

// ---- Responses ----------------------------------------------------------------------

const staffRef = z.object({ id: z.uuid(), displayName: z.string() });
const serviceTierRef = z.object({ id: z.uuid(), slug: z.string(), name: z.string() });

const adminLead = z
  .object({
    id: z.uuid(),
    email: z.string(),
    fullName: z.string(),
    phone: z.string().nullable(),
    companyName: z.string().nullable(),
    source: z.string().nullable(),
    campaign: z.string().nullable(),
    landingPath: z.string().nullable(),
    status: z.enum(LEAD_STATUSES),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: 'AdminLead' });

export const leadListResponseSchema = z.object({
  data: z.array(
    adminLead
      .extend({ applicationCount: z.number().int(), contactSubmissionCount: z.number().int() })
      .meta({ id: 'AdminLeadListItem' }),
  ),
  pagination: paginationSchema,
});

export const applicationListResponseSchema = z.object({
  data: z.array(
    z
      .object({
        id: z.uuid(),
        reference: z.string(),
        status: z.enum(APPLICATION_STATUSES),
        formVersion: z.string(),
        submittedAt: z.date(),
        reviewedAt: z.date().nullable(),
        acceptedAt: z.date().nullable(),
        serviceTier: serviceTierRef.nullable(),
        lead: z.object({
          id: z.uuid(),
          fullName: z.string(),
          email: z.string(),
          source: z.string().nullable(),
          campaign: z.string().nullable(),
        }),
      })
      .meta({ id: 'AdminApplicationListItem' }),
  ),
  pagination: paginationSchema,
});

export const applicationDetailResponseSchema = z.object({
  data: z
    .object({
      application: z.object({
        id: z.uuid(),
        reference: z.string(),
        status: z.enum(APPLICATION_STATUSES),
        formVersion: z.string(),
        submittedAt: z.date(),
        reviewedAt: z.date().nullable(),
        acceptedAt: z.date().nullable(),
        rejectionReason: z.string().nullable(),
        reviewer: staffRef.nullable(),
        createdAt: z.date(),
        updatedAt: z.date(),
      }),
      lead: adminLead,
      serviceTier: serviceTierRef.nullable(),
      answers: z.array(
        z.object({
          questionKey: z.string(),
          label: z.string().nullable(),
          type: z.string().nullable(),
          answer: z.unknown(),
        }),
      ),
      events: z.array(
        z.object({
          id: z.uuid(),
          eventType: z.string(),
          actorType: z.enum(ACTOR_TYPES),
          actorId: z.uuid().nullable(),
          actor: staffRef.nullable(),
          metadata: z.record(z.string(), z.unknown()).nullable(),
          createdAt: z.date(),
        }),
      ),
      notes: z.array(
        z.object({ id: z.uuid(), body: z.string(), author: staffRef, createdAt: z.date() }),
      ),
      scheduling: z.object({
        session: z
          .object({
            provider: z.string(),
            providerReference: z.string().nullable(),
            expiresAt: z.date().nullable(),
            usedAt: z.date().nullable(),
            createdAt: z.date(),
          })
          .nullable(),
        meetings: z.array(
          z.object({
            id: z.uuid(),
            provider: z.string(),
            status: z.enum(MEETING_STATUSES),
            startsAt: z.date(),
            endsAt: z.date(),
            meetingUrl: z.string().nullable(),
            createdAt: z.date(),
          }),
        ),
      }),
      otherApplications: z.array(
        z.object({
          id: z.uuid(),
          reference: z.string(),
          status: z.enum(APPLICATION_STATUSES),
          submittedAt: z.date(),
        }),
      ),
      availableActions: z
        .array(z.enum(ADMIN_APPLICATION_ACTIONS))
        .describe('Actions the current staff user may take now (state machine + role)'),
    })
    .meta({ id: 'AdminApplicationDetail' }),
});

export const transitionResponseSchema = z
  .object({
    data: z.object({
      id: z.uuid(),
      status: z.enum(APPLICATION_STATUSES),
      events: z.array(z.enum(APPLICATION_EVENT_TYPES)),
    }),
  })
  .meta({ id: 'AdminTransitionResult' });

export const noteCreatedResponseSchema = z
  .object({ data: z.object({ id: z.uuid(), createdAt: z.date() }) })
  .meta({ id: 'AdminNoteCreated' });

export const auditLogListResponseSchema = z.object({
  data: z.array(
    z
      .object({
        id: z.uuid(),
        action: z.string(),
        entityType: z.string(),
        entityId: z.uuid().nullable(),
        actor: z
          .object({
            id: z.uuid(),
            displayName: z.string(),
            email: z.string(),
            role: z.enum(STAFF_ROLES),
          })
          .nullable()
          .describe('Null for system/CLI actions'),
        metadata: z.record(z.string(), z.unknown()).nullable(),
        createdAt: z.date(),
      })
      .meta({ id: 'AdminAuditLogEntry' }),
  ),
  pagination: paginationSchema,
});

// ---- Notifications ------------------------------------------------------------------

export const notificationListQuerySchema = z.strictObject({
  ...paginationQuerySchema.shape,
  status: z.enum(NOTIFICATION_EVENT_STATUSES).optional(),
  eventType: z.enum(NOTIFICATION_EVENT_TYPES).optional(),
});

export const notificationIdParamsSchema = z.object({ id: z.uuid() });

export const notificationListResponseSchema = z.object({
  data: z.array(
    z
      .object({
        id: z.uuid(),
        eventType: z.string(),
        subjectType: z.string(),
        subjectId: z.uuid(),
        status: z.enum(NOTIFICATION_EVENT_STATUSES),
        attempts: z.number().int(),
        lastError: z.string().nullable().describe('Sanitized error code; never provider messages'),
        nextAttemptAt: z.date(),
        processedAt: z.date().nullable(),
        createdAt: z.date(),
        deliveries: z.array(
          z.object({
            id: z.uuid(),
            template: z.string(),
            recipient: z.string(),
            provider: z.string(),
            status: z.enum(NOTIFICATION_STATUSES),
            attempts: z.number().int(),
            lastError: z.string().nullable(),
            providerMessageId: z.string().nullable(),
            sentAt: z.date().nullable(),
          }),
        ),
      })
      .meta({ id: 'AdminNotificationEvent' }),
  ),
  pagination: paginationSchema,
});

export const notificationRequeuedResponseSchema = z
  .object({ data: z.object({ id: z.uuid(), status: z.literal('PENDING') }) })
  .meta({ id: 'AdminNotificationRequeued' });
