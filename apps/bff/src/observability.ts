import type { FastifyRequest } from 'fastify';
import type { Config } from './config';

/**
 * Error-reporting hook. Wire `@sentry/node` here when SENTRY_DSN is set (plan §9 Observability):
 *
 *   Sentry.init({ dsn: config.sentryDsn, environment: config.env, release: process.env.RELEASE });
 *   reportError = (err, req) => Sentry.captureException(err, { tags: { requestId: req?.id } });
 *
 * The SDK is intentionally not a dependency yet; until then this only logs.
 */
export function createErrorReporter(config: Config) {
  return (err: unknown, req?: FastifyRequest) => {
    if (!config.sentryDsn) return;
    req?.log.debug({ err }, 'would report to Sentry');
  };
}
