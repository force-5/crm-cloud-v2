import type { FastifyInstance } from 'fastify';
import type { Config } from '../config';

/** Max envelope size forwarded (Sentry's own limit is larger; error events are small). */
const MAX_ENVELOPE_BYTES = 200 * 1024;

type DsnTarget = { host: string; projectId: string; url: string };

function parseDsn(dsn: string): DsnTarget | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\/+/, '');
    if (!/^\d+$/.test(projectId) || u.protocol !== 'https:') return null;
    return { host: u.host, projectId, url: `https://${u.host}/api/${projectId}/envelope/` };
  } catch {
    return null;
  }
}

/**
 * `POST {apiPrefix}/sentry-tunnel`: lets the browser SDK report errors through the BFF, so the strict CSP
 * (`connect-src 'self'`) stays intact. It forwards ONLY to the configured Sentry projects (never an open
 * relay), is size-capped and rate limited, and needs no session (errors on the sign-in page count too).
 * Registered outside the CSRF-checked /api scope because the SDK can't send our CSRF header; that's safe
 * because it changes no state in the CRM.
 */
export async function sentryTunnelRoutes(app: FastifyInstance, config: Config) {
  const allowed = [config.sentryDsn, config.sentryWebDsn]
    .filter((d): d is string => !!d)
    .map(parseDsn)
    .filter((t): t is DsnTarget => !!t);
  if (allowed.length === 0) return; // Sentry off: the route doesn't exist

  app.post(
    `${config.apiPrefix}/sentry-tunnel`,
    {
      bodyLimit: MAX_ENVELOPE_BYTES,
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const body = typeof req.body === 'string' ? req.body : '';
      const headerLine = body.slice(0, body.indexOf('\n'));
      let dsn: string | undefined;
      try {
        dsn = (JSON.parse(headerLine) as { dsn?: string }).dsn;
      } catch {
        return reply.code(400).send();
      }
      const target = dsn ? parseDsn(dsn) : null;
      const match = target && allowed.find((a) => a.host === target.host && a.projectId === target.projectId);
      if (!match) return reply.code(400).send();

      try {
        const res = await fetch(match.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-sentry-envelope' },
          body,
          signal: AbortSignal.timeout(5000),
        });
        return reply.code(res.ok ? 200 : 502).send();
      } catch {
        return reply.code(502).send();
      }
    },
  );
}
