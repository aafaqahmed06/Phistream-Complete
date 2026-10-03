import { and, asc, count, desc, eq, gte, ilike, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { Db } from '../../db/client.js';
import type {
  ActorType,
  ApplicationStatus,
  LeadStatus,
  MeetingStatus,
  StaffRole,
} from '../../db/schema/enums.js';
import {
  applicationAnswers,
  applicationEvents,
  applicationForms,
  applicationNotes,
  applications,
  auditLogs,
  contactSubmissions,
  leads,
  meetings,
  schedulingSessions,
  serviceTiers,
  staffUsers,
} from '../../db/schema/index.js';

/**
 * Read models for the admin API. PRIVATE data, served only to authenticated
 * staff. Every query selects an explicit column list: secrets such as token
 * hashes and submission fingerprints are never read here.
 */

export interface Page {
  readonly limit: number;
  readonly offset: number;
}

export interface PageResult<T> {
  readonly items: T[];
  readonly total: number;
}

export interface LeadFilters extends Page {
  readonly status?: LeadStatus | undefined;
  readonly source?: string | undefined;
  readonly campaign?: string | undefined;
  readonly createdFrom?: Date | undefined;
  readonly createdTo?: Date | undefined;
  /** Case-insensitive substring of email, name, or company. */
  readonly search?: string | undefined;
}

export interface AdminLeadRow {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  companyName: string | null;
  source: string | null;
  campaign: string | null;
  landingPath: string | null;
  status: LeadStatus;
  applicationCount: number;
  contactSubmissionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationFilters extends Page {
  readonly status?: ApplicationStatus | undefined;
  readonly serviceTierId?: string | undefined;
  /** Lead acquisition source. */
  readonly source?: string | undefined;
  readonly submittedFrom?: Date | undefined;
  readonly submittedTo?: Date | undefined;
}

export interface StaffRef {
  id: string;
  displayName: string;
}

export interface ServiceTierRef {
  id: string;
  slug: string;
  name: string;
}

export interface AdminApplicationRow {
  id: string;
  reference: string;
  status: ApplicationStatus;
  formVersion: string;
  submittedAt: Date;
  reviewedAt: Date | null;
  acceptedAt: Date | null;
  serviceTier: ServiceTierRef | null;
  lead: {
    id: string;
    fullName: string;
    email: string;
    source: string | null;
    campaign: string | null;
  };
}

export interface AdminApplicationDetailRow {
  application: {
    id: string;
    reference: string;
    status: ApplicationStatus;
    formVersion: string;
    submittedAt: Date;
    reviewedAt: Date | null;
    acceptedAt: Date | null;
    rejectionReason: string | null;
    reviewer: StaffRef | null;
    createdAt: Date;
    updatedAt: Date;
  };
  lead: Omit<AdminLeadRow, 'applicationCount' | 'contactSubmissionCount'>;
  serviceTier: ServiceTierRef | null;
  formDefinition: unknown;
  answers: { questionKey: string; answer: unknown }[];
  events: {
    id: string;
    eventType: string;
    actorType: ActorType;
    actorId: string | null;
    actor: StaffRef | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  }[];
  notes: { id: string; body: string; author: StaffRef; createdAt: Date }[];
  scheduling: {
    session: {
      provider: string;
      providerReference: string | null;
      expiresAt: Date | null;
      usedAt: Date | null;
      createdAt: Date;
    } | null;
    meetings: {
      id: string;
      provider: string;
      status: MeetingStatus;
      startsAt: Date;
      endsAt: Date;
      meetingUrl: string | null;
      createdAt: Date;
    }[];
  };
  otherApplications: {
    id: string;
    reference: string;
    status: ApplicationStatus;
    submittedAt: Date;
  }[];
}

export interface ContactSubmissionFilters extends Page {
  readonly leadId?: string | undefined;
  readonly createdFrom?: Date | undefined;
  readonly createdTo?: Date | undefined;
  /** Case-insensitive substring of the lead's email, the sender's name, company, or message. */
  readonly search?: string | undefined;
}

export interface AdminContactSubmissionRow {
  id: string;
  /** Contact details as submitted with this message (the lead keeps its own). */
  fullName: string;
  phone: string | null;
  companyName: string | null;
  message: string;
  source: string | null;
  campaign: string | null;
  createdAt: Date;
  lead: { id: string; email: string; status: LeadStatus };
}

export interface AuditLogFilters extends Page {
  readonly action?: string | undefined;
  readonly entityType?: string | undefined;
  readonly entityId?: string | undefined;
  readonly actorId?: string | undefined;
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
}

export interface AdminAuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: (StaffRef & { email: string; role: StaffRole }) | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AdminRepository {
  listLeads(filters: LeadFilters): Promise<PageResult<AdminLeadRow>>;
  listApplications(filters: ApplicationFilters): Promise<PageResult<AdminApplicationRow>>;
  getApplicationDetail(id: string): Promise<AdminApplicationDetailRow | undefined>;
  listContactSubmissions(
    filters: ContactSubmissionFilters,
  ): Promise<PageResult<AdminContactSubmissionRow>>;
  listAuditLogs(filters: AuditLogFilters): Promise<PageResult<AdminAuditLogRow>>;
}

/** Escapes LIKE wildcards so user input is matched literally. */
export function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function all(conditions: (SQL | undefined)[]): SQL | undefined {
  return and(...conditions.filter((c): c is SQL => c !== undefined));
}

async function withTotal<T>(
  items: Promise<T[]>,
  totals: Promise<{ total: number }[]>,
): Promise<PageResult<T>> {
  const [rows, counted] = await Promise.all([items, totals]);
  return { items: rows, total: counted[0]?.total ?? 0 };
}

function staffRef(id: string | null, displayName: string | null): StaffRef | null {
  return id !== null && displayName !== null ? { id, displayName } : null;
}

export function createAdminRepository(db: Db): AdminRepository {
  const reviewer = alias(staffUsers, 'reviewer');

  return {
    listLeads(filters) {
      const where = all([
        filters.status && eq(leads.status, filters.status),
        filters.source !== undefined ? eq(leads.source, filters.source) : undefined,
        filters.campaign !== undefined ? eq(leads.campaign, filters.campaign) : undefined,
        filters.createdFrom && gte(leads.createdAt, filters.createdFrom),
        filters.createdTo && lt(leads.createdAt, filters.createdTo),
        filters.search !== undefined
          ? or(
              ilike(leads.email, likeContains(filters.search)),
              ilike(leads.fullName, likeContains(filters.search)),
              ilike(leads.companyName, likeContains(filters.search)),
            )
          : undefined,
      ]);
      return withTotal(
        db
          .select({
            id: leads.id,
            email: leads.email,
            fullName: leads.fullName,
            phone: leads.phone,
            companyName: leads.companyName,
            source: leads.source,
            campaign: leads.campaign,
            landingPath: leads.landingPath,
            status: leads.status,
            // The outer lead is named explicitly: inside a select, Drizzle renders
            // ${leads.id} as a bare "id", which the subquery would resolve to its
            // own table's id, so every count came back 0.
            applicationCount: sql<number>`(select count(*)::int from ${applications} where ${applications.leadId} = "leads"."id")`,
            contactSubmissionCount: sql<number>`(select count(*)::int from ${contactSubmissions} where ${contactSubmissions.leadId} = "leads"."id")`,
            createdAt: leads.createdAt,
            updatedAt: leads.updatedAt,
          })
          .from(leads)
          .where(where)
          .orderBy(desc(leads.createdAt), desc(leads.id))
          .limit(filters.limit)
          .offset(filters.offset),
        db.select({ total: count() }).from(leads).where(where),
      );
    },

    async listApplications(filters) {
      const where = all([
        filters.status && eq(applications.status, filters.status),
        filters.serviceTierId !== undefined
          ? eq(applications.serviceTierId, filters.serviceTierId)
          : undefined,
        filters.source !== undefined ? eq(leads.source, filters.source) : undefined,
        filters.submittedFrom && gte(applications.submittedAt, filters.submittedFrom),
        filters.submittedTo && lt(applications.submittedAt, filters.submittedTo),
      ]);
      const page = await withTotal(
        db
          .select({
            id: applications.id,
            reference: applications.reference,
            status: applications.status,
            formVersion: applications.formVersion,
            submittedAt: applications.submittedAt,
            reviewedAt: applications.reviewedAt,
            acceptedAt: applications.acceptedAt,
            tierId: serviceTiers.id,
            tierSlug: serviceTiers.slug,
            tierName: serviceTiers.name,
            leadId: leads.id,
            leadName: leads.fullName,
            leadEmail: leads.email,
            leadSource: leads.source,
            leadCampaign: leads.campaign,
          })
          .from(applications)
          .innerJoin(leads, eq(leads.id, applications.leadId))
          .leftJoin(serviceTiers, eq(serviceTiers.id, applications.serviceTierId))
          .where(where)
          .orderBy(desc(applications.submittedAt), desc(applications.id))
          .limit(filters.limit)
          .offset(filters.offset),
        db
          .select({ total: count() })
          .from(applications)
          .innerJoin(leads, eq(leads.id, applications.leadId))
          .where(where),
      );
      return {
        total: page.total,
        items: page.items.map((row) => ({
          id: row.id,
          reference: row.reference,
          status: row.status,
          formVersion: row.formVersion,
          submittedAt: row.submittedAt,
          reviewedAt: row.reviewedAt,
          acceptedAt: row.acceptedAt,
          serviceTier:
            row.tierId !== null && row.tierSlug !== null && row.tierName !== null
              ? { id: row.tierId, slug: row.tierSlug, name: row.tierName }
              : null,
          lead: {
            id: row.leadId,
            fullName: row.leadName,
            email: row.leadEmail,
            source: row.leadSource,
            campaign: row.leadCampaign,
          },
        })),
      };
    },

    async getApplicationDetail(id) {
      const [row] = await db
        .select({
          id: applications.id,
          reference: applications.reference,
          status: applications.status,
          formVersion: applications.formVersion,
          submittedAt: applications.submittedAt,
          reviewedAt: applications.reviewedAt,
          acceptedAt: applications.acceptedAt,
          rejectionReason: applications.rejectionReason,
          createdAt: applications.createdAt,
          updatedAt: applications.updatedAt,
          reviewerId: reviewer.id,
          reviewerName: reviewer.displayName,
          lead: {
            id: leads.id,
            email: leads.email,
            fullName: leads.fullName,
            phone: leads.phone,
            companyName: leads.companyName,
            source: leads.source,
            campaign: leads.campaign,
            landingPath: leads.landingPath,
            status: leads.status,
            createdAt: leads.createdAt,
            updatedAt: leads.updatedAt,
          },
          tierId: serviceTiers.id,
          tierSlug: serviceTiers.slug,
          tierName: serviceTiers.name,
          formDefinition: applicationForms.definition,
        })
        .from(applications)
        .innerJoin(leads, eq(leads.id, applications.leadId))
        .innerJoin(applicationForms, eq(applicationForms.version, applications.formVersion))
        .leftJoin(serviceTiers, eq(serviceTiers.id, applications.serviceTierId))
        .leftJoin(reviewer, eq(reviewer.id, applications.reviewedBy))
        .where(eq(applications.id, id))
        .limit(1);
      if (!row) return undefined;

      const [answers, events, notes, sessions, meetingRows, others] = await Promise.all([
        db
          .select({
            questionKey: applicationAnswers.questionKey,
            answer: applicationAnswers.answer,
          })
          .from(applicationAnswers)
          .where(eq(applicationAnswers.applicationId, id)),
        db
          .select({
            id: applicationEvents.id,
            eventType: applicationEvents.eventType,
            actorType: applicationEvents.actorType,
            actorId: applicationEvents.actorId,
            actorName: staffUsers.displayName,
            metadata: applicationEvents.metadata,
            createdAt: applicationEvents.createdAt,
          })
          .from(applicationEvents)
          .leftJoin(
            staffUsers,
            and(
              eq(applicationEvents.actorType, 'STAFF'),
              eq(staffUsers.id, applicationEvents.actorId),
            ),
          )
          .where(eq(applicationEvents.applicationId, id))
          .orderBy(asc(applicationEvents.createdAt), asc(applicationEvents.id)),
        db
          .select({
            id: applicationNotes.id,
            body: applicationNotes.body,
            authorId: staffUsers.id,
            authorName: staffUsers.displayName,
            createdAt: applicationNotes.createdAt,
          })
          .from(applicationNotes)
          .innerJoin(staffUsers, eq(staffUsers.id, applicationNotes.authorId))
          .where(eq(applicationNotes.applicationId, id))
          .orderBy(asc(applicationNotes.createdAt), asc(applicationNotes.id)),
        db
          .select({
            provider: schedulingSessions.provider,
            providerReference: schedulingSessions.providerReference,
            expiresAt: schedulingSessions.expiresAt,
            usedAt: schedulingSessions.usedAt,
            createdAt: schedulingSessions.createdAt,
          })
          .from(schedulingSessions)
          .where(eq(schedulingSessions.applicationId, id))
          .limit(1),
        db
          .select({
            id: meetings.id,
            provider: meetings.provider,
            status: meetings.status,
            startsAt: meetings.startsAt,
            endsAt: meetings.endsAt,
            meetingUrl: meetings.meetingUrl,
            createdAt: meetings.createdAt,
          })
          .from(meetings)
          .where(eq(meetings.applicationId, id))
          .orderBy(asc(meetings.startsAt)),
        db
          .select({
            id: applications.id,
            reference: applications.reference,
            status: applications.status,
            submittedAt: applications.submittedAt,
          })
          .from(applications)
          .where(and(eq(applications.leadId, row.lead.id), ne(applications.id, id)))
          .orderBy(desc(applications.submittedAt)),
      ]);

      return {
        application: {
          id: row.id,
          reference: row.reference,
          status: row.status,
          formVersion: row.formVersion,
          submittedAt: row.submittedAt,
          reviewedAt: row.reviewedAt,
          acceptedAt: row.acceptedAt,
          rejectionReason: row.rejectionReason,
          reviewer: staffRef(row.reviewerId, row.reviewerName),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
        lead: row.lead,
        serviceTier:
          row.tierId !== null && row.tierSlug !== null && row.tierName !== null
            ? { id: row.tierId, slug: row.tierSlug, name: row.tierName }
            : null,
        formDefinition: row.formDefinition,
        answers,
        events: events.map(({ actorName, ...event }) => ({
          ...event,
          actor: staffRef(actorName !== null ? event.actorId : null, actorName),
        })),
        notes: notes.map(({ authorId, authorName, ...note }) => ({
          ...note,
          author: { id: authorId, displayName: authorName },
        })),
        scheduling: { session: sessions[0] ?? null, meetings: meetingRows },
        otherApplications: others,
      };
    },

    async listContactSubmissions(filters) {
      const where = all([
        filters.leadId !== undefined ? eq(contactSubmissions.leadId, filters.leadId) : undefined,
        filters.createdFrom && gte(contactSubmissions.createdAt, filters.createdFrom),
        filters.createdTo && lt(contactSubmissions.createdAt, filters.createdTo),
        filters.search !== undefined
          ? or(
              ilike(leads.email, likeContains(filters.search)),
              ilike(contactSubmissions.fullName, likeContains(filters.search)),
              ilike(contactSubmissions.companyName, likeContains(filters.search)),
              ilike(contactSubmissions.message, likeContains(filters.search)),
            )
          : undefined,
      ]);
      const page = await withTotal(
        db
          .select({
            id: contactSubmissions.id,
            fullName: contactSubmissions.fullName,
            phone: contactSubmissions.phone,
            companyName: contactSubmissions.companyName,
            message: contactSubmissions.message,
            source: contactSubmissions.source,
            campaign: contactSubmissions.campaign,
            createdAt: contactSubmissions.createdAt,
            leadId: leads.id,
            leadEmail: leads.email,
            leadStatus: leads.status,
          })
          .from(contactSubmissions)
          .innerJoin(leads, eq(leads.id, contactSubmissions.leadId))
          .where(where)
          .orderBy(desc(contactSubmissions.createdAt), desc(contactSubmissions.id))
          .limit(filters.limit)
          .offset(filters.offset),
        db
          .select({ total: count() })
          .from(contactSubmissions)
          .innerJoin(leads, eq(leads.id, contactSubmissions.leadId))
          .where(where),
      );
      return {
        total: page.total,
        items: page.items.map(({ leadId, leadEmail, leadStatus, ...row }) => ({
          ...row,
          lead: { id: leadId, email: leadEmail, status: leadStatus },
        })),
      };
    },

    async listAuditLogs(filters) {
      const where = all([
        filters.action !== undefined ? eq(auditLogs.action, filters.action) : undefined,
        filters.entityType !== undefined ? eq(auditLogs.entityType, filters.entityType) : undefined,
        filters.entityId !== undefined ? eq(auditLogs.entityId, filters.entityId) : undefined,
        filters.actorId !== undefined ? eq(auditLogs.actorId, filters.actorId) : undefined,
        filters.from && gte(auditLogs.createdAt, filters.from),
        filters.to && lt(auditLogs.createdAt, filters.to),
      ]);
      const page = await withTotal(
        db
          .select({
            id: auditLogs.id,
            action: auditLogs.action,
            entityType: auditLogs.entityType,
            entityId: auditLogs.entityId,
            actorId: staffUsers.id,
            actorName: staffUsers.displayName,
            actorEmail: staffUsers.email,
            actorRole: staffUsers.role,
            metadata: auditLogs.metadata,
            createdAt: auditLogs.createdAt,
          })
          .from(auditLogs)
          .leftJoin(staffUsers, eq(staffUsers.id, auditLogs.actorId))
          .where(where)
          .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
          .limit(filters.limit)
          .offset(filters.offset),
        db.select({ total: count() }).from(auditLogs).where(where),
      );
      return {
        total: page.total,
        items: page.items.map(({ actorId, actorName, actorEmail, actorRole, ...entry }) => ({
          ...entry,
          actor:
            actorId !== null && actorName !== null && actorEmail !== null && actorRole !== null
              ? { id: actorId, displayName: actorName, email: actorEmail, role: actorRole }
              : null,
        })),
      };
    },
  };
}
