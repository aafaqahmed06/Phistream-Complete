import type { ApplicationStatus, StaffRole } from '../../db/schema/enums.js';
import { AppError } from '../../shared/errors/app-error.js';
import { formDefinitionSchema, type FormQuestion } from '../applications/application-form.js';
import { checkTransition } from '../applications/application-status.js';
import type {
  AdminApplicationDetailRow,
  AdminApplicationRow,
  AdminAuditLogRow,
  AdminLeadRow,
  AdminRepository,
  ApplicationFilters,
  AuditLogFilters,
  LeadFilters,
} from './admin.repository.js';
import type { Db } from '../../db/client.js';
import { eraseLead, type ErasureSummary } from './data-retention.js';
import { hasPermission } from './permissions.js';

/**
 * Admin read models. Authorization happens in the routes (permissions.ts);
 * this layer shapes data, e.g. labelling answers with the questions of the
 * application's own form version.
 */

export const ADMIN_APPLICATION_ACTIONS = [
  'review',
  'accept',
  'reject',
  'schedule',
  'note',
] as const;
export type AdminApplicationAction = (typeof ADMIN_APPLICATION_ACTIONS)[number];

export interface AdminAnswer {
  readonly questionKey: string;
  /** From the form version the applicant answered; null if unknown. */
  readonly label: string | null;
  readonly type: FormQuestion['type'] | null;
  readonly answer: unknown;
}

export type AdminApplicationDetail = Omit<
  AdminApplicationDetailRow,
  'formDefinition' | 'answers'
> & {
  readonly answers: AdminAnswer[];
  /** What the current staff user may do now (state machine + role). */
  readonly availableActions: AdminApplicationAction[];
};

export interface Paged<T> {
  readonly data: T[];
  readonly pagination: { limit: number; offset: number; total: number };
}

export interface AdminService {
  /** Permanently erase a lead and linked records; undefined if unknown. */
  readonly eraseLead?: (id: string, actorId: string) => Promise<ErasureSummary | undefined>;
  listLeads(filters: LeadFilters): Promise<Paged<AdminLeadRow>>;
  listApplications(filters: ApplicationFilters): Promise<Paged<AdminApplicationRow>>;
  getApplication(id: string, viewerRole: StaffRole): Promise<AdminApplicationDetail>;
  listAuditLogs(filters: AuditLogFilters): Promise<Paged<AdminAuditLogRow>>;
}

/** Answers in question order, then any keys the form no longer describes. */
export function labelAnswers(
  definition: unknown,
  answers: readonly { questionKey: string; answer: unknown }[],
): AdminAnswer[] {
  const parsed = formDefinitionSchema.safeParse(definition);
  const questions = parsed.success ? parsed.data.questions : [];
  const byKey = new Map(answers.map((a) => [a.questionKey, a.answer]));

  const labelled: AdminAnswer[] = [];
  for (const question of questions) {
    if (!byKey.has(question.key)) continue;
    labelled.push({
      questionKey: question.key,
      label: question.label,
      type: question.type,
      answer: byKey.get(question.key),
    });
    byKey.delete(question.key);
  }
  for (const [questionKey, answer] of [...byKey].sort(([a], [b]) => a.localeCompare(b))) {
    labelled.push({ questionKey, label: null, type: null, answer });
  }
  return labelled;
}

export function availableActions(
  status: ApplicationStatus,
  role: StaffRole,
): AdminApplicationAction[] {
  const actions: AdminApplicationAction[] = [];
  if (hasPermission(role, 'applications:decide')) {
    if (checkTransition(status, 'UNDER_REVIEW', 'STAFF').ok) actions.push('review');
    if (checkTransition(status, 'ACCEPTED', 'STAFF').ok) actions.push('accept');
    if (checkTransition(status, 'REJECTED', 'STAFF').ok) actions.push('reject');
  }
  // Issue/re-issue a scheduling access link while a booking is awaited.
  if (status === 'SCHEDULING_OPEN' && hasPermission(role, 'scheduling:manage')) {
    actions.push('schedule');
  }
  if (hasPermission(role, 'applications:note')) actions.push('note');
  return actions;
}

function paged<T>(
  result: { items: T[]; total: number },
  page: { limit: number; offset: number },
): Paged<T> {
  return {
    data: result.items,
    pagination: { limit: page.limit, offset: page.offset, total: result.total },
  };
}

export function createAdminService(deps: {
  repository: AdminRepository;
  /** Enables erasure; omitted in HTTP-only tests. */
  database?: Db;
}): AdminService {
  const { repository, database } = deps;
  return {
    ...(database
      ? { eraseLead: (id: string, actorId: string) => eraseLead(database, id, actorId) }
      : {}),
    async listLeads(filters) {
      return paged(await repository.listLeads(filters), filters);
    },
    async listApplications(filters) {
      return paged(await repository.listApplications(filters), filters);
    },
    async getApplication(id, viewerRole) {
      const row = await repository.getApplicationDetail(id);
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Application not found.');
      const { formDefinition, answers, ...rest } = row;
      return {
        ...rest,
        answers: labelAnswers(formDefinition, answers),
        availableActions: availableActions(row.application.status, viewerRole),
      };
    },
    async listAuditLogs(filters) {
      return paged(await repository.listAuditLogs(filters), filters);
    },
  };
}
