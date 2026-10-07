import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { startStack } from './helpers';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Regressions for the security review's Low findings (L1–L7). */
describe('hardening', () => {
  it('L7: sessions end at the absolute lifetime, however active', async () => {
    const stack = await startStack({ env: { SESSION_MAX_HOURS: String(0.5 / 3600) } }); // 0.5 s
    try {
      const c = stack.client();
      await c.loginOk();
      expect((await c.get('/auth/session')).status).toBe(200);
      await sleep(700);
      const r = await c.get('/auth/session');
      expect(r.status).toBe(401);
      expect(r.json.error.message).toMatch(/sign in again/i);
    } finally {
      await stack.close();
    }
  });

  it('L7: removing the CRM role in VMS ends access at the next token refresh', async () => {
    // A 60 s access token is always inside the 5-minute refresh window, so every request refreshes.
    const stack = await startStack({ mock: { accessTtlSeconds: 60 } });
    try {
      const c = stack.client();
      await c.loginOk();
      expect((await c.get('/accounts')).status).toBe(200);

      const admin = stack.mock.db.users.find((u) => u.email === 'admin@force5.com')!;
      const roles = admin.roles;
      admin.roles = [];
      const r = await c.get('/accounts');
      expect(r.status).toBe(403);
      expect((await c.get('/auth/session')).status).toBe(401); // session was ended, not just refused once
      admin.roles = roles;
    } finally {
      await stack.close();
    }
  });

  it('L2: API responses are never cacheable', async () => {
    const stack = await startStack();
    try {
      const c = stack.client();
      await c.loginOk();
      for (const path of ['/profile', '/accounts', '/auth/session']) {
        expect((await c.get(path)).headers['cache-control'], path).toBe('no-store');
      }
    } finally {
      await stack.close();
    }
  });

  it('L3: VMS error text is not passed to the client', async () => {
    const stack = await startStack();
    try {
      const c = stack.client();
      await c.loginOk();
      const r = await c.get('/accounts/999999');
      expect(r.status).toBe(404);
      expect(r.json.error.message).toBe('That record could not be found.');
      expect(JSON.stringify(r.json)).not.toMatch(/tenant/i);
    } finally {
      await stack.close();
    }
  });

  it('L1: dotfiles in WEB_DIST are never served', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crm-web-'));
    writeFileSync(join(dir, 'index.html'), '<div id="root"></div>');
    writeFileSync(join(dir, '.env'), 'SECRET=1');
    const app = await buildApp(loadConfig({ APP_ENV: 'local', WEB_DIST: dir, LOG_LEVEL: 'silent' }), { logger: false });
    try {
      const r = await app.inject('/crm/.env');
      expect(r.body).not.toContain('SECRET');
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('L9: uploads must really be the image type they claim, and inputs are bounded', async () => {
    const stack = await startStack();
    try {
      const c = stack.client();
      await c.loginOk();
      const fakePng = `data:image/png;base64,${Buffer.from('<?php echo "not an image"; ?>').toString('base64')}`;
      for (const [path, method] of [
        ['/accounts/1/logo', 'put'],
        ['/accounts/1/signin-image', 'put'],
        ['/profile/photo', 'put'],
      ] as const) {
        const r = await c[method](path, { dataUrl: fakePng });
        expect(r.status, path).toBe(400);
      }
      expect((await c.put('/profile/photo', { dataUrl: 'data:image/png;base64,***not base64***' })).status).toBe(400);

      const tooLong = await stack.client().login('admin@force5.com', 'x'.repeat(300));
      expect(tooLong.status).toBe(400);
    } finally {
      await stack.close();
    }
  });

  it('L4: a production runtime refuses to start as APP_ENV=local', () => {
    expect(() => loadConfig({ APP_ENV: 'local', NODE_ENV: 'production' })).toThrow(/APP_ENV must be set/);
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/APP_ENV must be set/);
  });
});
