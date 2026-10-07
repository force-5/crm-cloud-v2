import { API } from '@crm/contracts';
import type { FastifyInstance } from 'fastify';
import type { Deps } from '../deps';

/** `GET /crm/api/health` — unauthenticated, for the load balancer. */
export async function healthRoutes(app: FastifyInstance, deps: Deps) {
  const ping = async (url: string) => {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(3000) });
      return res.ok ? 'up' : 'down';
    } catch {
      return 'down';
    }
  };

  // Unauthenticated, so callers can't fan it out into upstream traffic: one upstream check per 5s at most,
  // shared by concurrent callers (review L5).
  let cached: { at: number; result: Promise<{ status: string; vms: string; keycloak: string }> } | undefined;
  const check = async () => {
    const [vms, keycloak] = await Promise.all([ping(`${deps.config.vmsUrl}ping`), ping(deps.config.keycloak.realmUrl)]);
    return { status: vms === 'up' && keycloak === 'up' ? 'ok' : 'degraded', vms, keycloak };
  };

  app.get(API.health, { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (_req, reply) => {
    if (!cached || Date.now() - cached.at > 5_000) cached = { at: Date.now(), result: check() };
    reply.header('Cache-Control', 'no-store');
    // The BFF itself is healthy either way (200), so the LB doesn't cycle it over a VMS outage.
    return cached.result;
  });
}
