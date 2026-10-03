import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { StaffDirectory, StaffPrincipal } from '../../modules/admin/staff.repository.js';
import { hasPermission, type Permission } from '../../modules/admin/permissions.js';
import {
  StaffAuthUnavailableError,
  type StaffTokenVerifier,
} from '../../providers/auth/staff-token-verifier.js';
import { AppError } from '../../shared/errors/app-error.js';

/**
 * Staff authentication for an encapsulated route scope (the admin API).
 * Not wrapped in fastify-plugin on purpose: the hooks apply only to routes
 * registered in the same scope, never to public routes.
 *
 * Per request, in `onRequest` (before the body is parsed or validated, so
 * unauthenticated callers learn nothing about payload rules):
 *   1. `Authorization: Bearer <JWT>` is required            → else 401
 *   2. the token is verified (signature, iss, aud, exp, alg) → else 401
 *   3. `sub` must map to an ACTIVE `staff_users` row          → else 403
 * The resolved principal is available as `request.staff`. Routes then call
 * `requirePermission(...)` for role checks (→ 403).
 *
 * Staff state is read on every request, so deactivation or a role change
 * takes effect immediately, without waiting for the token to expire.
 */

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the staff auth hook on admin routes; null elsewhere. */
    staff: StaffPrincipal | null;
  }
}

export interface StaffAuthOptions {
  /** Undefined when staff auth is not configured: every request gets 503. */
  readonly verifier: StaffTokenVerifier | undefined;
  readonly directory: StaffDirectory;
}

const JWT_BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;
const MAX_TOKEN_LENGTH = 8192;

function parseBearerJwt(header: string | undefined): string | undefined {
  if (header === undefined || header.length > MAX_TOKEN_LENGTH + 7) return undefined;
  return JWT_BEARER.exec(header.trim())?.[1];
}

export function registerStaffAuth(app: FastifyInstance, options: StaffAuthOptions): void {
  const { verifier, directory } = options;

  if (!app.hasRequestDecorator('staff')) app.decorateRequest('staff', null);

  app.addHook('onRequest', async (request) => {
    if (!verifier) {
      throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Staff authentication is not configured.');
    }

    const token = parseBearerJwt(request.headers.authorization);
    if (!token) {
      request.log.info({ authFailure: 'missing_token' }, 'staff authentication failed');
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    let identity;
    try {
      identity = await verifier.verify(token);
    } catch (error) {
      if (error instanceof StaffAuthUnavailableError) {
        request.log.error({ err: error }, 'staff token verification unavailable');
        throw new AppError(
          503,
          'SERVICE_UNAVAILABLE',
          'Authentication is temporarily unavailable.',
        );
      }
      throw error;
    }
    if (!identity) {
      request.log.info({ authFailure: 'invalid_token' }, 'staff authentication failed');
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired credentials.');
    }

    const staff = await directory.findActiveByAuthProviderId(identity.subject);
    if (!staff) {
      request.log.warn({ authFailure: 'not_staff' }, 'staff authentication failed');
      throw new AppError(403, 'FORBIDDEN', 'This account does not have staff access.');
    }

    request.staff = staff;
    // Correlate every later log line of this request with the acting staff user.
    request.log = request.log.child({ staffId: staff.id, staffRole: staff.role });
  });

  app.addHook('onSend', async (_request, reply) => {
    // Private data: never cache admin responses.
    reply.header('cache-control', 'no-store');
    if (reply.statusCode === 401) reply.header('www-authenticate', 'Bearer');
  });
}

/** Route preHandler: 403 unless the authenticated staff user's role allows it. */
export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const staff = request.staff;
    if (!staff || !hasPermission(staff.role, permission)) {
      request.log.warn(
        { authFailure: 'insufficient_role', permission },
        'staff authorization failed',
      );
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
    }
  };
}

/** The authenticated principal inside a handler (the hook guarantees it). */
export function currentStaff(request: FastifyRequest): StaffPrincipal {
  if (!request.staff) throw new Error('staff principal missing: route is outside the admin scope');
  return request.staff;
}
