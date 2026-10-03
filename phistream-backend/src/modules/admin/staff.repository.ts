import { and, asc, eq, sql } from 'drizzle-orm';

import type { Db, DbTransaction } from '../../db/client.js';
import type { StaffRole } from '../../db/schema/enums.js';
import { staffUsers } from '../../db/schema/index.js';
import { insertAuditLog } from './audit-log.js';

/**
 * Staff user mapping: auth-provider identity (`sub`) → staff record and role.
 * Staff are provisioned explicitly (CLI now, admin API later); signing up
 * with the auth provider alone never grants access.
 */

export interface StaffPrincipal {
  readonly id: string;
  readonly role: StaffRole;
  readonly email: string;
  readonly displayName: string;
}

export interface StaffDirectory {
  /** The ACTIVE staff user for this auth-provider subject, if any. */
  findActiveByAuthProviderId(subject: string): Promise<StaffPrincipal | undefined>;
}

const principalColumns = {
  id: staffUsers.id,
  role: staffUsers.role,
  email: staffUsers.email,
  displayName: staffUsers.displayName,
};

export function createStaffDirectory(db: Db): StaffDirectory {
  return {
    async findActiveByAuthProviderId(subject) {
      const rows = await db
        .select(principalColumns)
        .from(staffUsers)
        .where(and(eq(staffUsers.authProviderId, subject), eq(staffUsers.isActive, true)))
        .limit(1);
      return rows[0];
    },
  };
}

// ---- Provisioning (npm run staff) -----------------------------------------------------

export class StaffProvisioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaffProvisioningError';
  }
}

export interface StaffListing extends StaffPrincipal {
  readonly authProviderId: string;
  readonly isActive: boolean;
}

/** Every provisioning change is audited (actor null: performed via the CLI). */
export function createStaffAdministration(db: Db) {
  const byEmail = (email: string) => eq(sql`lower(${staffUsers.email})`, email.toLowerCase());

  async function findByEmail(tx: DbTransaction, email: string) {
    const rows = await tx
      .select({ ...principalColumns, isActive: staffUsers.isActive })
      .from(staffUsers)
      .where(byEmail(email))
      .for('update');
    const row = rows[0];
    if (!row) throw new StaffProvisioningError(`No staff user with email ${email}.`);
    return row;
  }

  return {
    async add(input: {
      authProviderId: string;
      email: string;
      displayName: string;
      role: StaffRole;
    }): Promise<StaffPrincipal> {
      return db.transaction(async (tx) => {
        const clash = await tx
          .select({ id: staffUsers.id })
          .from(staffUsers)
          .where(
            sql`${staffUsers.authProviderId} = ${input.authProviderId} or ${byEmail(input.email)}`,
          )
          .limit(1);
        if (clash.length > 0) {
          throw new StaffProvisioningError(
            'A staff user with this auth id or email already exists.',
          );
        }
        const [created] = await tx
          .insert(staffUsers)
          .values({ ...input, email: input.email.toLowerCase() })
          .returning(principalColumns);
        if (!created) throw new Error('staff insert returned no row');
        await insertAuditLog(tx, {
          actorId: null,
          action: 'staff.added',
          entityType: 'staff_user',
          entityId: created.id,
          metadata: { role: created.role, via: 'cli' },
        });
        return created;
      });
    },

    async setActive(email: string, isActive: boolean): Promise<void> {
      await db.transaction(async (tx) => {
        const staff = await findByEmail(tx, email);
        if (staff.isActive === isActive) return;
        await tx.update(staffUsers).set({ isActive }).where(eq(staffUsers.id, staff.id));
        await insertAuditLog(tx, {
          actorId: null,
          action: isActive ? 'staff.activated' : 'staff.deactivated',
          entityType: 'staff_user',
          entityId: staff.id,
          metadata: { via: 'cli' },
        });
      });
    },

    async setRole(email: string, role: StaffRole): Promise<void> {
      await db.transaction(async (tx) => {
        const staff = await findByEmail(tx, email);
        if (staff.role === role) return;
        await tx.update(staffUsers).set({ role }).where(eq(staffUsers.id, staff.id));
        await insertAuditLog(tx, {
          actorId: null,
          action: 'staff.role_changed',
          entityType: 'staff_user',
          entityId: staff.id,
          metadata: { from: staff.role, to: role, via: 'cli' },
        });
      });
    },

    async list(): Promise<StaffListing[]> {
      return db
        .select({
          ...principalColumns,
          authProviderId: staffUsers.authProviderId,
          isActive: staffUsers.isActive,
        })
        .from(staffUsers)
        .orderBy(asc(staffUsers.email));
    },
  };
}
