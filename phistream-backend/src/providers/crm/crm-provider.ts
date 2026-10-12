import type { ApplicationStatus } from '../../db/schema/enums.js';

/**
 * CRM provider port. The notifications module depends only on this file; the
 * adapter (Attio) is chosen in the composition root. Domain modules never call
 * a CRM: they write outbox events, and the dispatcher syncs them.
 */

export interface CrmPerson {
  readonly email: string;
  readonly name: string;
  readonly phone: string | null;
}

export interface CrmNote {
  readonly title: string;
  readonly content: string;
}

export interface CrmDeal {
  /** applications.reference: the stable key a deal is asserted on. */
  readonly reference: string;
  readonly name: string;
  readonly status: ApplicationStatus;
}

/**
 * A sync that did not succeed. `code` is safe to store and log (never contains
 * personal data); `retryable` says whether trying again later can help.
 */
export class CrmSyncError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(`crm sync failed: ${code}`, options);
    this.name = 'CrmSyncError';
  }
}

export interface CrmProvider {
  /** Lowercase slug, e.g. "attio". */
  readonly name: string;
  /** Upserts the person (by email) and optionally attaches a note. */
  syncContact(input: { person: CrmPerson; note: CrmNote }): Promise<void>;
  /** Upserts the person and the deal (by reference), optionally with a note. */
  syncApplication(input: { person: CrmPerson; deal: CrmDeal; note?: CrmNote }): Promise<void>;
  /** Deletes the person and the deals with these references (GDPR erasure). */
  erase(input: { email: string; references: readonly string[] }): Promise<void>;
}
