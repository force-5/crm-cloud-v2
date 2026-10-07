import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

const SHELL = '<!doctype html><html><body><div id="root"></div></body></html>';

describe('SPA serving (WEB_DIST)', () => {
  let dir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'crm-web-'));
    writeFileSync(join(dir, 'index.html'), SHELL);
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
    writeFileSync(join(dir, 'theme-init.js'), '/* theme */');
    app = await buildApp(loadConfig({ APP_ENV: 'local', WEB_DIST: dir, LOG_LEVEL: 'silent' }), { logger: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves the shell at the base path itself (regression: was a 403)', async () => {
    const r = await app.inject('/crm/');
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('<div id="root">');
    expect(r.headers['cache-control']).toBe('no-cache');
  });

  it('redirects / and /crm to /crm/', async () => {
    for (const url of ['/', '/crm']) {
      const r = await app.inject(url);
      expect(r.statusCode).toBe(302);
      expect(r.headers.location).toBe('/crm/');
    }
  });

  it('falls back to the shell for client-side routes', async () => {
    for (const url of ['/crm/accounts', '/crm/accounts/12?tab=licenses', '/crm/login']) {
      const r = await app.inject(url);
      expect(r.statusCode, url).toBe(200);
      expect(r.body).toContain('<div id="root">');
    }
  });

  it('caches hashed assets forever and other files never', async () => {
    const asset = await app.inject('/crm/assets/index-abc123.js');
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect((await app.inject('/crm/theme-init.js')).headers['cache-control']).toBe('no-cache');
  });

  it('never serves the shell for API paths', async () => {
    const r = await app.inject('/crm/api/accounts');
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    const missing = await app.inject('/crm/api/no-such-route');
    expect(missing.statusCode).toBe(404);
    expect(missing.headers['content-type']).toMatch(/json/);
  });
});
