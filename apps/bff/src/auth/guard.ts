import { PERMISSIONS, type CurrentUser, type Permission } from '@crm/contracts';
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { Config } from '../config';
import { forbidden, unauthenticated } from '../errors';
import type { VmsClient } from '../vms/client';
import type { KeycloakClient } from './keycloak';
import { ensureFreshToken } from './refresh';

/**
 * Decision D1: only Force 5 staff holding a CRM role (CRM_ALLOWED_ROLES, default CRM_ADMIN or ROLE_ADMIN)
 * — or, optionally, CRM_REQUIRED_PERMISSION — may use the CRM. VMS itself has no authorization on these
 * endpoints (V1b), so this is the real gate today.
 */
export function isCrmUser(user: CurrentUser, crm: Config['crm']): boolean {
  if (!crm.allowedTenantIds.includes(user.tenant.id)) return false;
  if (user.securityRoles.some((r) => crm.allowedRoles.includes(r.code))) return true;
  return (
    !!crm.requiredPermission &&
    user.permissions.some(
      (p) => p.code === crm.requiredPermission && (p.read || p.create || p.update || p.delete || p.execute),
    )
  );
}

const FULL = { read: true, create: true, update: true, delete: true, execute: true };

/**
 * The SPA and mobile app gate screens on the CRM permission codes in `PERMISSIONS`, which VMS doesn't
 * define. A user who passes D1 is granted all of them (unless VMS already sent its own grant for a code),
 * so D1 stays decided in one place: here.
 */
export function withCrmGrants(user: CurrentUser, crm: Config['crm']): CurrentUser {
  if (!isCrmUser(user, crm)) return user;
  const have = new Set(user.permissions.map((p) => p.code));
  const granted: Permission[] = Object.values(PERMISSIONS)
    .filter((code) => !have.has(code))
    .map((code) => ({ code, ...FULL }));
  return granted.length ? { ...user, permissions: [...user.permissions, ...granted] } : user;
}

/**
 * preHandler for every protected `/api` route: authenticated session, idle timeout, D1 guard,
 * lazy token refresh, then binds a VMS client carrying the session's token to `req.vms`.
 */
export function requireAuth(deps: {
  config: Config;
  keycloak: KeycloakClient;
  vmsClient: VmsClient;
}): preHandlerAsyncHookHandler {
  const idleMs = deps.config.sessionIdleMinutes * 60_000;
  return async function requireAuthHook(req: FastifyRequest, _reply: FastifyReply) {
    const auth = req.session.auth;
    if (!auth) throw unauthenticated();

    const lastSeen = req.session.lastSeen ?? auth.loginAt;
    if (Date.now() - lastSeen > idleMs) {
      await req.session.destroy();
      throw unauthenticated('You were signed out after a period of inactivity.');
    }
    if (!isCrmUser(auth.user, deps.config.crm)) {
      await req.session.destroy();
      throw forbidden('You do not have access to the Force 5 CRM.');
    }

    await ensureFreshToken(req, deps.keycloak);
    req.session.lastSeen = Date.now();
    req.vms = deps.vmsClient.bind({
      token: req.session.auth!.accessToken,
      requestId: req.id,
      userAgent: req.headers['user-agent'],
    });
  };
}
