import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id, lengthBetween, oneOf, updatedAt } from './columns.js';
import { LEAD_STATUSES } from './enums.js';

/**
 * People/businesses that entered the funnel (leads module). PRIVATE.
 *
 * Email is indexed case-insensitively but deliberately NOT unique: whether one
 * email may map to several leads is a business rule still to be confirmed
 * (DATA_MODEL.md › leads). The contact flow's deduplication policy lives in
 * `src/modules/leads/contact.service.ts`.
 */
export const leads = pgTable(
  'leads',
  {
    id: id(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    companyName: text('company_name'),
    source: text('source'),
    campaign: text('campaign'),
    landingPath: text('landing_path'),
    status: text('status', { enum: LEAD_STATUSES }).notNull().default('NEW'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('leads_email_lower_idx').on(sql`lower(${t.email})`),
    index('leads_status_idx').on(t.status),
    index('leads_created_at_idx').on(t.createdAt),
    index('leads_source_idx').on(t.source),
    index('leads_campaign_idx').on(t.campaign),
    check('leads_status_valid', oneOf(t.status, LEAD_STATUSES)),
    check('leads_email_format', sql`${t.email} ~ '^[^@\\s]+@[^@\\s]+$'`),
    check('leads_email_length', lengthBetween(t.email, 3, 320)),
    check('leads_full_name_length', lengthBetween(t.fullName, 1, 200)),
    check('leads_phone_length', lengthBetween(t.phone, 1, 50)),
    check('leads_company_name_length', lengthBetween(t.companyName, 1, 200)),
    check('leads_source_length', lengthBetween(t.source, 1, 100)),
    check('leads_campaign_length', lengthBetween(t.campaign, 1, 100)),
    check('leads_landing_path_length', lengthBetween(t.landingPath, 1, 2048)),
  ],
).enableRLS();

/**
 * One row per accepted contact-form message (leads module). PRIVATE.
 *
 * Contact details are stored as submitted, because the public endpoint may
 * only fill blank fields on an existing lead, never overwrite them. Source and
 * campaign are per-message attribution; the lead keeps its first touch.
 * Deleted with the lead (retention/deletion requests).
 */
export const contactSubmissions = pgTable(
  'contact_submissions',
  {
    id: id(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    companyName: text('company_name'),
    message: text('message').notNull(),
    source: text('source'),
    campaign: text('campaign'),
    createdAt: createdAt(),
  },
  (t) => [
    // Lead history and the per-email duplicate/flood checks.
    index('contact_submissions_lead_id_created_at_idx').on(t.leadId, t.createdAt),
    index('contact_submissions_created_at_idx').on(t.createdAt),
    check('contact_submissions_full_name_length', lengthBetween(t.fullName, 1, 200)),
    check('contact_submissions_phone_length', lengthBetween(t.phone, 1, 50)),
    check('contact_submissions_company_name_length', lengthBetween(t.companyName, 1, 200)),
    check('contact_submissions_message_length', lengthBetween(t.message, 1, 5000)),
    check('contact_submissions_source_length', lengthBetween(t.source, 1, 100)),
    check('contact_submissions_campaign_length', lengthBetween(t.campaign, 1, 100)),
  ],
).enableRLS();
