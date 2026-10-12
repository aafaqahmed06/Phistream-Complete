import { z } from 'zod';

import type { ApplicationStatus } from '../../db/schema/enums.js';
import {
  CrmSyncError,
  type CrmDeal,
  type CrmNote,
  type CrmPerson,
  type CrmProvider,
} from './crm-provider.js';

/**
 * Attio adapter (REST, no SDK). Everything Attio-specific lives here.
 *
 *   PUT  {base}/objects/people/records?matching_attribute=email_addresses
 *   PUT  {base}/objects/deals/records?matching_attribute=phistream_reference
 *   POST {base}/notes
 *   Authorization: Bearer <ATTIO_API_KEY>      { data: { values: {...} } }
 *
 * Both upserts are idempotent, so retries never duplicate people or deals. The
 * deal's `phistream_reference` attribute must exist in the workspace and be
 * unique. Attio error *messages* can echo submitted values, so only the
 * response `code` is kept.
 */

export interface AttioConfig {
  readonly apiKey: string;
  readonly apiBaseUrl: string;
  /** Workspace member (email) set as the deal owner; Attio requires one. */
  readonly dealOwnerEmail: string;
  /** Application status → Attio deal stage title; overrides DEFAULT_STAGES. */
  readonly stages: Readonly<Partial<Record<ApplicationStatus, string>>>;
}

export const ATTIO_PROVIDER = 'attio';

/** Stage titles of Attio's default sales pipeline; override with ATTIO_STAGE_MAP. */
export const DEFAULT_STAGES: Readonly<Record<ApplicationStatus, string>> = {
  NEW: 'Lead',
  UNDER_REVIEW: 'In Progress',
  ACCEPTED: 'In Progress',
  SCHEDULING_OPEN: 'In Progress',
  SCHEDULED: 'In Progress',
  COMPLETED: 'In Progress',
  CONVERTED: 'Won 🎉',
  REJECTED: 'Lost',
  WITHDRAWN: 'Lost',
  ARCHIVED: 'Lost',
  NO_SHOW: 'Lost',
};

const recordBody = z.object({ data: z.object({ id: z.object({ record_id: z.string().min(1) }) }) });
const queryBody = z.object({
  data: z.array(z.object({ id: z.object({ record_id: z.string().min(1) }) })),
});
const errorBody = z.object({ code: z.string().max(100).optional() });

const slug = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60);

/** Attio rejects phone numbers it cannot parse, so only send plausible E.164. */
const E164 = /^\+[1-9]\d{6,14}$/;

export function createAttioProvider(
  config: AttioConfig,
  deps: { fetch?: typeof fetch; timeoutMs?: number } = {},
): CrmProvider {
  const doFetch = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 10_000;

  async function call(method: string, path: string, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await doFetch(`${config.apiBaseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const code = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network';
      throw new CrmSyncError(`attio_${code}`, true, { cause: error });
    }
    const json: unknown = await response.json().catch(() => undefined);
    if (response.ok) return json;
    const code = errorBody.safeParse(json).data?.code;
    // 429 and 5xx are transient; other 4xx (bad key, unknown attribute or
    // stage, ambiguous match) need a human.
    throw new CrmSyncError(
      `attio_${response.status}${code ? `_${slug(code)}` : ''}`,
      response.status === 429 || response.status >= 500,
    );
  }

  async function assert(
    object: 'people' | 'deals',
    matchingAttribute: string,
    values: Record<string, unknown>,
  ): Promise<string> {
    const json = await call(
      'PUT',
      `/objects/${object}/records?matching_attribute=${matchingAttribute}`,
      { data: { values } },
    );
    const parsed = recordBody.safeParse(json);
    if (!parsed.success) throw new CrmSyncError('attio_unexpected_response', true);
    return parsed.data.data.id.record_id;
  }

  // ponytail: PUT replaces multi-value attributes, so extra emails/phones staff add in Attio are overwritten on the next sync; switch to PATCH-append if that matters.
  function upsertPerson(person: CrmPerson): Promise<string> {
    const [first = '', ...rest] = person.name.trim().split(/\s+/);
    return assert('people', 'email_addresses', {
      email_addresses: [{ email_address: person.email }],
      name: [{ first_name: first, last_name: rest.join(' '), full_name: person.name.trim() }],
      ...(person.phone && E164.test(person.phone.replace(/[\s()-]/g, ''))
        ? { phone_numbers: [{ original_phone_number: person.phone.replace(/[\s()-]/g, '') }] }
        : {}),
    });
  }

  async function addNote(personId: string, note: CrmNote): Promise<void> {
    await call('POST', '/notes', {
      data: {
        parent_object: 'people',
        parent_record_id: personId,
        title: note.title,
        format: 'plaintext',
        content: note.content,
      },
    });
  }

  function upsertDeal(personId: string, deal: CrmDeal): Promise<string> {
    const stage = config.stages[deal.status] ?? DEFAULT_STAGES[deal.status];
    return assert('deals', 'phistream_reference', {
      phistream_reference: deal.reference,
      name: deal.name,
      stage,
      owner: config.dealOwnerEmail,
      associated_people: [{ target_object: 'people', target_record_id: personId }],
    });
  }

  async function findIds(object: 'people' | 'deals', filter: object): Promise<string[]> {
    const json = await call('POST', `/objects/${object}/records/query`, { filter, limit: 50 });
    const parsed = queryBody.safeParse(json);
    if (!parsed.success) throw new CrmSyncError('attio_unexpected_response', true);
    return parsed.data.data.map((record) => record.id.record_id);
  }

  return {
    name: ATTIO_PROVIDER,

    async syncContact({ person, note }) {
      const personId = await upsertPerson(person);
      await addNote(personId, note);
    },

    async syncApplication({ person, deal, note }) {
      const personId = await upsertPerson(person);
      await upsertDeal(personId, deal);
      if (note) await addNote(personId, note);
    },

    async erase({ email, references }) {
      const targets: [string, string][] = [];
      for (const reference of references) {
        for (const id of await findIds('deals', { phistream_reference: reference })) {
          targets.push(['deals', id]);
        }
      }
      for (const id of await findIds('people', { email_addresses: email })) {
        targets.push(['people', id]);
      }
      for (const [object, id] of targets) {
        await call('DELETE', `/objects/${object}/records/${id}`);
      }
    },
  };
}
