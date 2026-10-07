import type { ErrorEvent } from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { scrubEvent } from '../src/observability';

const WEB_DSN = 'https://publickey@o123.ingest.sentry.io/4567';
const envelope = (dsn: string) => `${JSON.stringify({ dsn, sent_at: '2026-10-07T00:00:00Z' })}\n{"type":"event"}\n{"message":"boom"}`;

async function appWithTunnel() {
  const app = await buildApp(loadConfig({ APP_ENV: 'local', SENTRY_WEB_DSN: WEB_DSN, LOG_LEVEL: 'silent' }), { logger: false });
  await app.ready();
  return app;
}

describe('Sentry', () => {
  afterEach(() => vi.restoreAllMocks());

  it('tunnel forwards envelopes for the configured project only (never an open relay)', async () => {
    const app = await appWithTunnel();
    const realFetch = globalThis.fetch;
    const forwarded: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('sentry.io')) {
        forwarded.push(url);
        return new Response(null, { status: 200 });
      }
      return realFetch(input, init);
    });
    try {
      const post = (body: string) =>
        app.inject({ method: 'POST', url: '/crm/api/sentry-tunnel', headers: { 'content-type': 'text/plain' }, payload: body });

      expect((await post(envelope(WEB_DSN))).statusCode).toBe(200);
      expect(forwarded).toEqual(['https://o123.ingest.sentry.io/api/4567/envelope/']);

      // Someone else's project, a non-https DSN, and garbage are all refused without forwarding.
      expect((await post(envelope('https://k@o999.ingest.sentry.io/1'))).statusCode).toBe(400);
      expect((await post(envelope('http://publickey@o123.ingest.sentry.io/4567'))).statusCode).toBe(400);
      expect((await post('not an envelope')).statusCode).toBe(400);
      expect(forwarded).toHaveLength(1);

      // No session or CSRF token needed (errors on the sign-in page must report), but bodies are capped.
      expect((await post(envelope(WEB_DSN) + 'x'.repeat(300 * 1024))).statusCode).toBe(413);
    } finally {
      await app.close();
    }
  });

  it('the tunnel does not exist when Sentry is not configured', async () => {
    const app = await buildApp(loadConfig({ APP_ENV: 'local', LOG_LEVEL: 'silent' }), { logger: false });
    const r = await app.inject({ method: 'POST', url: '/crm/api/sentry-tunnel', payload: envelope(WEB_DSN) });
    expect(r.statusCode).toBe(404);
    await app.close();
  });

  it('scrubs cookies, headers, bodies, query strings and user data from events', () => {
    const event = scrubEvent({
      type: undefined,
      message: 'boom',
      user: { email: 'a@force5.com' },
      request: {
        url: 'https://crm.force5.cloud/crm/api/accounts?search=acme',
        cookies: { 'crm.sid': 's%3Asecret' },
        headers: { 'x-csrf-token': 't', cookie: 'crm.sid=secret' },
        data: '{"password":"hunter2"}',
        query_string: 'search=acme',
      },
    } as ErrorEvent);
    expect(event.message).toBe('boom');
    expect(event.request).toEqual({ url: 'https://crm.force5.cloud/crm/api/accounts' });
    expect(event.user).toBeUndefined();
    expect(JSON.stringify(event)).not.toMatch(/secret|hunter2|a@force5/);
  });
});
