import { OPEN_LEAD_STATUSES, type LeadStatus } from '../../db/schema/enums.js';
import type {
  FillableLeadFields,
  LeadRecord,
  LeadResolutionOperations,
} from './leads.repository.js';

/**
 * Which lead a public submission (contact message, application) belongs to.
 * Must run inside `withEmailLock` for the same normalized email.
 *
 * - Latest lead with this email is open (NEW, CONTACTED, QUALIFIED)
 *   → reuse it. Blank fields (phone, company, first-touch source/campaign) are
 *   filled in; stored values are NEVER overwritten, because public callers
 *   are unauthenticated and anyone can type anyone's email. Status is not
 *   changed.
 * - No lead, or the latest is closed (CONVERTED, LOST, ARCHIVED)
 *   → create a new NEW lead, so a returning person reaches the new-lead queue
 *   instead of being buried in a closed record.
 */

export interface LeadCandidate {
  /** Normalized (trimmed, lowercase). */
  readonly email: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly companyName: string | null;
  readonly source: string | null;
  readonly campaign: string | null;
}

export interface ResolvedLead {
  readonly leadId: string;
  readonly leadCreated: boolean;
}

const OPEN_STATUSES: ReadonlySet<LeadStatus> = new Set(OPEN_LEAD_STATUSES);

export function isOpenLead(lead: Pick<LeadRecord, 'status'>): boolean {
  return OPEN_STATUSES.has(lead.status);
}

/** Values the candidate can contribute to blank fields of an existing lead. */
export function fillableFields(lead: LeadRecord, candidate: LeadCandidate): FillableLeadFields {
  const fields: { -readonly [K in keyof FillableLeadFields]: FillableLeadFields[K] } = {};
  if (lead.phone === null && candidate.phone) fields.phone = candidate.phone;
  if (lead.companyName === null && candidate.companyName) {
    fields.companyName = candidate.companyName;
  }
  if (lead.source === null && candidate.source) fields.source = candidate.source;
  if (lead.campaign === null && candidate.campaign) fields.campaign = candidate.campaign;
  return fields;
}

export async function resolveLead(
  tx: LeadResolutionOperations,
  candidate: LeadCandidate,
): Promise<ResolvedLead> {
  const existing = await tx.findLatestLeadByEmail(candidate.email);
  if (existing && isOpenLead(existing)) {
    await tx.fillMissingLeadFields(existing.id, fillableFields(existing, candidate));
    return { leadId: existing.id, leadCreated: false };
  }
  return { leadId: await tx.createLead(candidate), leadCreated: true };
}
