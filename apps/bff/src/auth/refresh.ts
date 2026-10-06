import type { FastifyRequest } from 'fastify';
import { unauthenticated } from '../errors';
import type { KeycloakClient, TokenSet } from './keycloak';

/** Refresh when this much (or less) access-token lifetime is left. */
export const REFRESH_WINDOW_MS = 5 * 60_000;

// Concurrent requests from one session share a single refresh call.
const inflight = new Map<string, Promise<TokenSet>>();

/**
 * Lazy token refresh (replaces the old 2-minute `checkRefreshToken` polling): before proxying,
 * if the access token has ≤5 minutes left, run the refresh_token grant with the session's tenant_id.
 * A failed refresh ends the session (401).
 */
export async function ensureFreshToken(req: FastifyRequest, keycloak: KeycloakClient): Promise<void> {
  const auth = req.session.auth;
  if (!auth) throw unauthenticated();
  if (auth.expiresAt - Date.now() > REFRESH_WINDOW_MS) return;

  if (auth.refreshExpiresAt && auth.refreshExpiresAt <= Date.now()) {
    await req.session.destroy();
    throw unauthenticated('Your session has expired. Please sign in again.');
  }

  const key = req.session.sessionId;
  let p = inflight.get(key);
  if (!p) {
    p = keycloak.refreshGrant(auth.refreshToken, auth.tenantId).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  try {
    const tokens = await p;
    req.session.auth = { ...auth, ...tokens };
    req.log.debug({ tenantId: auth.tenantId }, 'access token refreshed');
  } catch (err) {
    req.log.info({ err }, 'token refresh failed; ending session');
    await req.session.destroy();
    throw unauthenticated('Your session has expired. Please sign in again.');
  }
}
