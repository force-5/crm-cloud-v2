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

  app.get(API.health, async (_req, reply) => {
    const [vms, keycloak] = await Promise.all([ping(`${deps.config.vmsUrl}ping`), ping(deps.config.keycloak.realmUrl)]);
    reply.header('Cache-Control', 'no-store');
    // The BFF itself is healthy either way (200), so the LB doesn't cycle it over a VMS outage.
    return { status: vms === 'up' && keycloak === 'up' ? 'ok' : 'degraded', vms, keycloak };
  });
}
