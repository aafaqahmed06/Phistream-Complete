import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { createdAt, id, lengthBetween, updatedAt } from './columns.js';

/**
 * Public content (content module).
 *
 * Rows are publishable only when `is_active` / `is_public` is true, and new
 * rows default to hidden. These tables hold no private data; they are still
 * RLS-enabled because the browser never reads the database directly.
 */

export const serviceTiers = pgTable(
  'service_tiers',
  {
    id: id(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    /** Minor currency units (e.g. cents). Null = price not published. */
    priceAmount: integer('price_amount'),
    /** ISO 4217 code. Must be set together with `price_amount`. */
    currency: text('currency'),
    billingPeriod: text('billing_period'),
    displayOrder: integer('display_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(false),
    features: jsonb('features').$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('service_tiers_slug_key').on(t.slug),
    index('service_tiers_active_display_order_idx')
      .on(t.displayOrder)
      .where(sql`is_active`),
    check('service_tiers_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('service_tiers_name_length', lengthBetween(t.name, 1, 200)),
    check(
      'service_tiers_price_amount_non_negative',
      sql`${t.priceAmount} is null or ${t.priceAmount} >= 0`,
    ),
    check('service_tiers_currency_format', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check(
      'service_tiers_price_currency_pair',
      sql`(${t.priceAmount} is null) = (${t.currency} is null)`,
    ),
    check('service_tiers_billing_period_length', lengthBetween(t.billingPeriod, 1, 50)),
    check('service_tiers_features_is_array', sql`jsonb_typeof(${t.features}) = 'array'`),
  ],
).enableRLS();

export const faqs = pgTable(
  'faqs',
  {
    id: id(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('faqs_active_display_order_idx')
      .on(t.displayOrder)
      .where(sql`is_active`),
    check('faqs_question_length', lengthBetween(t.question, 1, 500)),
    check('faqs_answer_length', lengthBetween(t.answer, 1, 10_000)),
  ],
).enableRLS();

export const testimonials = pgTable(
  'testimonials',
  {
    id: id(),
    name: text('name').notNull(),
    role: text('role'),
    company: text('company'),
    quote: text('quote').notNull(),
    avatarUrl: text('avatar_url'),
    displayOrder: integer('display_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('testimonials_active_display_order_idx')
      .on(t.displayOrder)
      .where(sql`is_active`),
    check('testimonials_name_length', lengthBetween(t.name, 1, 200)),
    check('testimonials_quote_length', lengthBetween(t.quote, 1, 5000)),
    check('testimonials_avatar_url_https', sql`${t.avatarUrl} ~ '^https://'`),
  ],
).enableRLS();

/**
 * Typed key/value configuration (VSL URL, contact details, onboarding copy...).
 * Only `is_public` rows may ever be served by public endpoints.
 */
export const siteConfig = pgTable(
  'site_config',
  {
    id: id(),
    key: text('key').notNull(),
    value: jsonb('value').$type<unknown>().notNull(),
    isPublic: boolean('is_public').notNull().default(false),
    description: text('description'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('site_config_key_key').on(t.key),
    index('site_config_public_idx')
      .on(t.key)
      .where(sql`is_public`),
    check('site_config_key_format', sql`${t.key} ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)*$'`),
    check('site_config_key_length', lengthBetween(t.key, 1, 100)),
  ],
).enableRLS();
