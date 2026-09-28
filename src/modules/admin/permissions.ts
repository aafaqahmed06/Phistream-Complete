import type { StaffRole } from '../../db/schema/enums.js';

/**
 * Staff authorization: which role may do what. Deliberately coarse (two roles,
 * DATA_MODEL.md) and kept in one table so it is easy to review. Checked on the
 * server for every admin route; the dashboard may use it to hide controls,
 * but hiding is never the enforcement.
 */
export const PERMISSIONS = {
  'leads:read': ['ADMIN', 'REVIEWER'],
  'applications:read': ['ADMIN', 'REVIEWER'],
  /** Start review, accept, reject. */
  'applications:decide': ['ADMIN', 'REVIEWER'],
  'applications:note': ['ADMIN', 'REVIEWER'],
  /** Issue scheduling access links; look up provider bookings. */
  'scheduling:manage': ['ADMIN', 'REVIEWER'],
  'audit_logs:read': ['ADMIN'],
  /** Permanently erase a lead and everything linked to it (privacy requests). */
  'leads:erase': ['ADMIN'],
  /** Funnel analytics (aggregates only). */
  'analytics:read': ['ADMIN'],
  /** Inspect notification delivery status and failures. */
  'notifications:read': ['ADMIN'],
  /** Requeue failed notifications. */
  'notifications:manage': ['ADMIN'],
} as const satisfies Record<string, readonly StaffRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: StaffRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly StaffRole[]).includes(role);
}
