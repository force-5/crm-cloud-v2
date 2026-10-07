import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';
import type { FastifyRequest } from 'fastify';
import type { Config } from './config';

/**
 * Removes everything that could identify a user or carry secrets before an event leaves the server:
 * cookies (session), headers (CSRF token, auth), request bodies (passwords, MFA codes, personal data),
 * query strings and user context. Errors are still useful with message, stack, route and request id.
 */
export function scrubEvent<E extends ErrorEvent>(event: E): E {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url) event.request.url = event.request.url.split('?')[0];
  }
  delete event.user;
  return event;
}

/**
 * Error reporting (plan §9 Observability). Off unless SENTRY_DSN is set. Only errors are captured
 * (no tracing / performance), and every event is scrubbed by `scrubEvent`.
 */
export function createErrorReporter(config: Config) {
  if (!config.sentryDsn) return (_err: unknown, _req?: FastifyRequest) => undefined;

  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.env,
    release: process.env.RELEASE || undefined,
    // Error capture only: no automatic HTTP/OTel instrumentation patching the server at runtime.
    defaultIntegrations: false,
    integrations: [Sentry.linkedErrorsIntegration(), Sentry.dedupeIntegration()],
    beforeSend: (event) => scrubEvent(event),
  });

  return (err: unknown, req?: FastifyRequest) => {
    Sentry.captureException(err, {
      tags: { requestId: req?.id ?? 'none', route: req?.routeOptions?.url ?? 'unknown' },
    });
  };
}
