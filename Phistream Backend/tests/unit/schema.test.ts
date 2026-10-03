import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as schema from '../../src/db/schema/index.js';
import * as demo from '../../src/db/seed/demo-data.js';

const tables = (Object.values(schema) as unknown[])
  .filter((value): value is PgTable => value instanceof PgTable)
  .map((table) => getTableConfig(table));

describe('schema conventions', () => {
  // DATA_MODEL.md tables plus contact_submissions and notification_events
  // (Phase 3), application_forms and application_access_tokens (Phase 4), and
  // scheduling_webhook_events (Phase 6);
  // see docs/database.md › Modelling decisions.
  it('defines every expected table', () => {
    expect(tables.map((t) => t.name).sort()).toEqual([
      'analytics_events',
      'application_access_tokens',
      'application_answers',
      'application_events',
      'application_forms',
      'application_notes',
      'applications',
      'audit_logs',
      'contact_submissions',
      'faqs',
      'leads',
      'meetings',
      'notification_deliveries',
      'notification_events',
      'scheduling_sessions',
      'scheduling_webhook_events',
      'service_tiers',
      'site_config',
      'staff_users',
      'testimonials',
    ]);
  });

  it.each(tables.map((t) => [t.name, t] as const))('%s enables row level security', (_, table) => {
    expect(table.enableRLS).toBe(true);
  });

  it.each(tables.map((t) => [t.name, t] as const))(
    '%s has a generated UUID primary key',
    (_, table) => {
      const idColumn = table.columns.find((column) => column.name === 'id');
      expect(idColumn?.primary).toBe(true);
      expect(idColumn?.getSQLType()).toBe('uuid');
      expect(idColumn?.hasDefault).toBe(true);
    },
  );

  it.each(tables.map((t) => [t.name, t] as const))(
    '%s stores timestamps with time zone',
    (_, table) => {
      const timestamps = table.columns.filter((column) =>
        column.getSQLType().startsWith('timestamp'),
      );
      expect(timestamps.length).toBeGreaterThan(0);
      for (const column of timestamps) {
        expect(column.getSQLType()).toBe('timestamp with time zone');
      }
    },
  );

  it.each(tables.map((t) => [t.name, t] as const))(
    '%s indexes every foreign key column',
    (_, table) => {
      const indexedLeadingColumns = new Set(
        table.indexes.map((index) => {
          const first = index.config.columns[0];
          return first && 'name' in first ? first.name : undefined;
        }),
      );
      for (const fk of table.foreignKeys) {
        const [column] = fk.reference().columns;
        expect(indexedLeadingColumns, `${table.name}.${column?.name}`).toContain(column?.name);
      }
    },
  );
});

describe('demo seed data', () => {
  const texts = JSON.stringify(Object.values(demo));

  it('marks public content as demo', () => {
    for (const row of [...demo.demoServiceTiers, ...demo.demoFaqs, ...demo.demoTestimonials]) {
      const values = Object.values(row).filter((v): v is string => typeof v === 'string');
      expect(values.some((v) => v.includes(demo.DEMO_TEXT_MARKER))).toBe(true);
    }
  });

  it('uses only reserved example domains for emails and URLs', () => {
    const emails = texts.match(/[\w.+-]+@[\w.-]+/g) ?? [];
    expect(emails.length).toBeGreaterThan(0);
    for (const email of emails) expect(email).toMatch(/@example\.com$/);

    const urls = texts.match(/https?:\/\/[^\s"]+/g) ?? [];
    for (const url of urls) expect(new URL(url).hostname).toBe('example.com');
  });

  it('uses the ISO 4217 testing currency for demo prices', () => {
    for (const tier of demo.demoServiceTiers) {
      if (tier.currency) expect(tier.currency).toBe('XTS');
    }
  });

  it('uses the demo UUID range for every row id', () => {
    const ids = [...texts.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) expect(id).toMatch(/^00000000-0000-4000-8000-\d{12}$/);
  });
});
