import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

// Behind CloudFront → ALB → nginx the BFF sees: socket = nginx, X-Forwarded-For = "<anything the client
// sent>, <client>, <CloudFront edge>, <ALB>". With 3 trusted hops, req.ip must be <client>, so a forged
// left-most entry can't dodge per-IP login rate limiting.
describe('TRUST_PROXY hop count', () => {
  it('resolves the real client IP and ignores a spoofed X-Forwarded-For prefix', async () => {
    const app = await buildApp(loadConfig({ APP_ENV: 'local', TRUST_PROXY: '3', LOG_LEVEL: 'silent' }), { logger: false });
    app.get('/whoami', async (req) => ({ ip: req.ip }));
    await app.ready();
    const r = await app.inject({
      url: '/whoami',
      remoteAddress: '127.0.0.1', // nginx
      headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.7, 130.176.0.1, 10.0.1.5' },
    });
    expect(r.json().ip).toBe('203.0.113.7');
    await app.close();
  });
});
