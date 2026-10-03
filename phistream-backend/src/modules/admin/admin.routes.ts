import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import {
  currentStaff,
  registerStaffAuth,
  requirePermission,
} from '../../plugins/auth/staff-auth.js';
import type { StaffTokenVerifier } from '../../providers/auth/staff-token-verifier.js';
import { AppError } from '../../shared/errors/app-error.js';
import { errorResponses } from '../../shared/errors/error-envelope.js';
import type { ApplicationReviewService } from '../applications/application-review.service.js';
import {
  bookingLookupResponseSchema,
  schedulingAccessIssuedResponseSchema,
} from '../scheduling/scheduling.schemas.js';
import { funnelQuerySchema, funnelResponseSchema } from '../analytics/analytics.schemas.js';
import type { AnalyticsService } from '../analytics/analytics.service.js';
import type { NotificationsRepository } from '../notifications/notifications.repository.js';
import type { SchedulingService } from '../scheduling/scheduling.service.js';
import {
  applicationDetailResponseSchema,
  applicationIdParamsSchema,
  applicationListQuerySchema,
  applicationListResponseSchema,
  auditLogListQuerySchema,
  auditLogListResponseSchema,
  contactSubmissionListQuerySchema,
  contactSubmissionListResponseSchema,
  leadErasedResponseSchema,
  leadIdParamsSchema,
  leadListQuerySchema,
  leadListResponseSchema,
  noteBodySchema,
  noteCreatedResponseSchema,
  notificationIdParamsSchema,
  notificationListQuerySchema,
  notificationListResponseSchema,
  notificationRequeuedResponseSchema,
  rejectBodySchema,
  transitionResponseSchema,
} from './admin.schemas.js';
import type { AdminService } from './admin.service.js';
import type { StaffDirectory } from './staff.repository.js';

export interface AdminRoutesOptions {
  readonly verifier: StaffTokenVerifier | undefined;
  readonly directory: StaffDirectory;
  readonly adminService: AdminService;
  readonly reviewService: ApplicationReviewService;
  /** Absent when scheduling routes are not wired (e.g. HTTP-only tests). */
  readonly schedulingService?: SchedulingService | undefined;
  /** Absent in HTTP-only tests. */
  readonly notificationsRepository?: NotificationsRepository | undefined;
  /** Absent in HTTP-only tests. */
  readonly analyticsService?: AnalyticsService | undefined;
}

export const STAFF_SECURITY_SCHEME = 'staffBearer';

/**
 * Staff-only API under /api/v1/admin. Every route in this scope requires an
 * authenticated, active staff user (registerStaffAuth) and a role permission
 * (requirePermission). There is deliberately no endpoint that sets an
 * application's status directly: only named actions, each validated by the
 * state machine and audited.
 */
export const adminRoutes: FastifyPluginAsyncZod<AdminRoutesOptions> = async (app, options) => {
  const {
    adminService,
    reviewService,
    schedulingService,
    notificationsRepository,
    analyticsService,
  } = options;
  registerStaffAuth(app, { verifier: options.verifier, directory: options.directory });

  const security = [{ [STAFF_SECURITY_SCHEME]: [] }];
  const tags = ['admin'];
  const common = {
    401: 'Missing, invalid, or expired staff token',
    403: 'Not an active staff user, or role lacks permission',
  };
  const describe = (text: string, extra: string[] = []) =>
    [text, '', `- \`401\`: ${common[401]}.`, `- \`403\`: ${common[403]}.`, ...extra].join('\n');

  app.get(
    '/leads',
    {
      preHandler: requirePermission('leads:read'),
      schema: {
        tags,
        security,
        operationId: 'adminListLeads',
        summary: 'List leads (newest first)',
        description: describe('Roles: ADMIN, REVIEWER.'),
        querystring: leadListQuerySchema,
        response: { 200: leadListResponseSchema, ...errorResponses },
      },
    },
    async (request) => adminService.listLeads(request.query),
  );

  app.get(
    '/contact-submissions',
    {
      preHandler: requirePermission('leads:read'),
      schema: {
        tags,
        security,
        operationId: 'adminListContactSubmissions',
        summary: 'List contact-form messages (newest first)',
        description: describe(
          'Roles: ADMIN, REVIEWER. Every accepted message, with the details sent alongside it and the lead it was filed under. Messages screened out as spam are never stored, so they do not appear.',
        ),
        querystring: contactSubmissionListQuerySchema,
        response: { 200: contactSubmissionListResponseSchema, ...errorResponses },
      },
    },
    async (request) => adminService.listContactSubmissions(request.query),
  );

  const { eraseLead } = adminService;
  if (eraseLead) {
    app.delete(
      '/leads/:id',
      {
        preHandler: requirePermission('leads:erase'),
        schema: {
          tags,
          security,
          operationId: 'adminEraseLead',
          summary: 'Permanently erase a lead (privacy request)',
          description: describe(
            'Roles: ADMIN only. Irreversible. Deletes the lead and everything linked to it: contact messages, applications, answers, notes, lifecycle events, tokens, scheduling sessions, meetings, and related notification records. Anonymous analytics rows are unlinked. Audited as `lead.erased` with counts only. Data held by providers (Cal.com, Resend, Supabase Auth) must be erased there separately.',
            ['- `404`: Unknown lead.'],
          ),
          params: leadIdParamsSchema,
          response: { 200: leadErasedResponseSchema, ...errorResponses },
        },
      },
      async (request) => {
        const { id } = request.params;
        const removed = await eraseLead(id, currentStaff(request).id);
        if (!removed) throw new AppError(404, 'NOT_FOUND', 'Lead not found.');
        return { data: { id, erased: true as const, removed } };
      },
    );
  }

  app.get(
    '/applications',
    {
      preHandler: requirePermission('applications:read'),
      schema: {
        tags,
        security,
        operationId: 'adminListApplications',
        summary: 'List applications (newest submission first)',
        description: describe('Roles: ADMIN, REVIEWER.'),
        querystring: applicationListQuerySchema,
        response: { 200: applicationListResponseSchema, ...errorResponses },
      },
    },
    async (request) => adminService.listApplications(request.query),
  );

  app.get(
    '/applications/:id',
    {
      preHandler: requirePermission('applications:read'),
      schema: {
        tags,
        security,
        operationId: 'adminGetApplication',
        summary: 'Full application: lead, answers, events, notes, scheduling',
        description: describe('Roles: ADMIN, REVIEWER.', ['- `404`: Unknown application.']),
        params: applicationIdParamsSchema,
        response: { 200: applicationDetailResponseSchema, ...errorResponses },
      },
    },
    async (request) => ({
      data: await adminService.getApplication(request.params.id, currentStaff(request).role),
    }),
  );

  const transitionErrors = [
    '- `404`: Unknown application.',
    '- `409 CONFLICT`: Not allowed from the current status (see `availableActions`).',
  ];

  app.post(
    '/applications/:id/review',
    {
      preHandler: requirePermission('applications:decide'),
      schema: {
        tags,
        security,
        operationId: 'adminStartReview',
        summary: 'Start review (NEW → UNDER_REVIEW)',
        description: describe('Roles: ADMIN, REVIEWER. Audited.', transitionErrors),
        params: applicationIdParamsSchema,
        response: { 200: transitionResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const { id } = request.params;
      const result = await reviewService.startReview(id, { staffId: currentStaff(request).id });
      return { data: { id, ...result } };
    },
  );

  app.post(
    '/applications/:id/accept',
    {
      preHandler: requirePermission('applications:decide'),
      schema: {
        tags,
        security,
        operationId: 'adminAcceptApplication',
        summary: 'Accept (UNDER_REVIEW → ACCEPTED → SCHEDULING_OPEN)',
        description: describe(
          'Roles: ADMIN, REVIEWER. Atomically records the acceptance (reviewer, timestamps, ACCEPTED event), enables scheduling (SYSTEM SCHEDULING_ENABLED event), writes the audit log, and queues the applicant notification.',
          transitionErrors,
        ),
        params: applicationIdParamsSchema,
        response: { 200: transitionResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const { id } = request.params;
      const result = await reviewService.accept(id, { staffId: currentStaff(request).id });
      return { data: { id, ...result } };
    },
  );

  app.post(
    '/applications/:id/reject',
    {
      preHandler: requirePermission('applications:decide'),
      schema: {
        tags,
        security,
        operationId: 'adminRejectApplication',
        summary: 'Reject (UNDER_REVIEW → REJECTED)',
        description: describe(
          'Roles: ADMIN, REVIEWER. Optional internal `reason` (never shown to the applicant; the audit log records only whether one was given). Queues the applicant notification.',
          transitionErrors,
        ),
        params: applicationIdParamsSchema,
        body: rejectBodySchema,
        response: { 200: transitionResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const { id } = request.params;
      const result = await reviewService.reject(
        id,
        { staffId: currentStaff(request).id },
        request.body?.reason,
      );
      return { data: { id, ...result } };
    },
  );

  app.post(
    '/applications/:id/notes',
    {
      preHandler: requirePermission('applications:note'),
      schema: {
        tags,
        security,
        operationId: 'adminAddApplicationNote',
        summary: 'Add an internal note',
        description: describe('Roles: ADMIN, REVIEWER. Audited (note id only).', [
          '- `404`: Unknown application.',
        ]),
        params: applicationIdParamsSchema,
        body: noteBodySchema,
        response: { 201: noteCreatedResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const note = await reviewService.addNote(
        request.params.id,
        { staffId: currentStaff(request).id },
        request.body.body,
      );
      return reply.status(201).send({ data: note });
    },
  );

  if (schedulingService) {
    app.post(
      '/applications/:id/scheduling-access',
      {
        preHandler: requirePermission('scheduling:manage'),
        schema: {
          tags,
          security,
          operationId: 'adminIssueSchedulingAccess',
          summary: 'Issue (or re-issue) a short-lived scheduling link',
          description: describe(
            'Roles: ADMIN, REVIEWER. Only for applications in SCHEDULING_OPEN (accepted, awaiting a booking). Creates a new token and invalidates any previous one for this application. The token is returned once and only its hash is stored. Audited (expiry only). Share the link with the applicant.',
            [
              '- `404`: Unknown application.',
              '- `409 CONFLICT`: Application is not awaiting a booking (e.g. NEW, REJECTED, already SCHEDULED).',
              '- `503`: Scheduling is not configured.',
            ],
          ),
          params: applicationIdParamsSchema,
          response: { 201: schedulingAccessIssuedResponseSchema, ...errorResponses },
        },
      },
      async (request, reply) => {
        const issued = await schedulingService.issueAccess(
          request.params.id,
          currentStaff(request).id,
        );
        return reply.status(201).send({ data: issued });
      },
    );

    app.get(
      '/applications/:id/booking',
      {
        preHandler: requirePermission('scheduling:manage'),
        schema: {
          tags,
          security,
          operationId: 'adminLookupBooking',
          summary: "Latest meeting plus the provider's live booking state",
          description: describe('Roles: ADMIN, REVIEWER. Read-only; calls the provider.', [
            '- `404`: No booking for this application.',
            '- `503`: Provider unavailable or booking lookup not configured.',
          ]),
          params: applicationIdParamsSchema,
          response: { 200: bookingLookupResponseSchema, ...errorResponses },
        },
      },
      async (request) => ({ data: await schedulingService.lookupBooking(request.params.id) }),
    );
  }

  if (notificationsRepository) {
    app.get(
      '/notifications',
      {
        preHandler: requirePermission('notifications:read'),
        schema: {
          tags,
          security,
          operationId: 'adminListNotifications',
          summary: 'Notification events and their deliveries (newest first)',
          description: describe(
            'Roles: ADMIN only. Use `?status=FAILED` to find notifications that need attention. `lastError` values are sanitized codes (e.g. `resend_403_validation_error`, `no_staff_recipients`).',
          ),
          querystring: notificationListQuerySchema,
          response: { 200: notificationListResponseSchema, ...errorResponses },
        },
      },
      async (request) => {
        const { limit, offset } = request.query;
        const page = await notificationsRepository.listEvents(request.query);
        return { data: page.items, pagination: { limit, offset, total: page.total } };
      },
    );

    app.post(
      '/notifications/:id/retry',
      {
        preHandler: requirePermission('notifications:manage'),
        schema: {
          tags,
          security,
          operationId: 'adminRetryNotification',
          summary: 'Requeue a FAILED notification',
          description: describe(
            'Roles: ADMIN only. Resets the attempt counter; deliveries already sent are not sent again. Audited.',
            [
              '- `404`: Unknown notification.',
              '- `409 CONFLICT`: Only FAILED notifications can be requeued.',
            ],
          ),
          params: notificationIdParamsSchema,
          response: { 200: notificationRequeuedResponseSchema, ...errorResponses },
        },
      },
      async (request) => {
        const { id } = request.params;
        const result = await notificationsRepository.requeue(id, currentStaff(request).id);
        if (result === 'not_found') throw new AppError(404, 'NOT_FOUND', 'Notification not found.');
        if (result === 'not_failed') {
          throw new AppError(409, 'CONFLICT', 'Only FAILED notifications can be requeued.');
        }
        return { data: { id, status: 'PENDING' as const } };
      },
    );
  }

  if (analyticsService) {
    app.get(
      '/analytics/funnel',
      {
        preHandler: requirePermission('analytics:read'),
        schema: {
          tags,
          security,
          operationId: 'adminGetFunnel',
          summary: 'Funnel counts and conversion ratios',
          description: describe(
            [
              'Roles: ADMIN only. Aggregates only; no visitor or applicant records.',
              '',
              '- Client stages (onboarding views, VSL, application starts) count **distinct anonymous sessions** with that event in [from, to).',
              '- Authoritative stages (applications, accepted, rejected, meetings booked) are the **cohort of applications submitted** in [from, to) and their outcome so far, read from application and meeting records. Browser events cannot change them.',
              '- All ratios are computed server-side. Ratios across the two bases (e.g. applications / onboarding views) are approximate.',
              '- `source` / `campaign` filter both: events by their reported attribution, applications by the attribution captured at submission.',
              '- Default period: the last 30 days; maximum 366 days.',
            ].join('\n'),
          ),
          querystring: funnelQuerySchema,
          response: { 200: funnelResponseSchema, ...errorResponses },
        },
      },
      async (request) => ({ data: await analyticsService.getFunnel(request.query) }),
    );
  }

  app.get(
    '/audit-logs',
    {
      preHandler: requirePermission('audit_logs:read'),
      schema: {
        tags,
        security,
        operationId: 'adminListAuditLogs',
        summary: 'Audit history (newest first)',
        description: describe('Roles: ADMIN only.'),
        querystring: auditLogListQuerySchema,
        response: { 200: auditLogListResponseSchema, ...errorResponses },
      },
    },
    async (request) => adminService.listAuditLogs(request.query),
  );
};
