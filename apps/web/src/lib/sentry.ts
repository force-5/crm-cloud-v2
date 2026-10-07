type SentryModule = typeof import('@sentry/react');

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/**
 * Browser error reporting (plan §9). Off unless the build sets VITE_SENTRY_DSN. Events go through the
 * BFF's same-origin tunnel, so the strict CSP (`connect-src 'self'`) needs no exceptions, and are
 * scrubbed of cookies, headers, request bodies, query strings and user data before they leave the page.
 * The SDK is loaded lazily, so builds without a DSN don't ship it to users.
 */
let sentry: SentryModule | undefined;

export async function initSentry() {
  if (!dsn) return;
  const Sentry = await import('@sentry/react');
  Sentry.init({
    dsn,
    tunnel: `${import.meta.env.BASE_URL}api/sentry-tunnel`,
    environment: (import.meta.env.VITE_APP_ENV as string | undefined) ?? import.meta.env.MODE,
    release: (import.meta.env.VITE_RELEASE as string | undefined) || undefined,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.data;
        delete event.request.query_string;
        if (event.request.url) event.request.url = event.request.url.split('?')[0];
      }
      delete event.user;
      return event;
    },
    // Breadcrumb URLs can carry search terms; keep the path only.
    beforeBreadcrumb(crumb) {
      const data = crumb.data as { url?: string; to?: string; from?: string } | undefined;
      if (data?.url) data.url = data.url.split('?')[0];
      if (data?.to) data.to = data.to.split('?')[0];
      if (data?.from) data.from = data.from.split('?')[0];
      return crumb;
    },
  });
  sentry = Sentry;
}

/** Report a render error caught by the route error boundary. No-op when Sentry is off. */
export function reportError(error: unknown) {
  sentry?.captureException(error);
}
