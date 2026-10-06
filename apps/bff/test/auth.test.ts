import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { authenticate } from '../src/vms/users';
import { PASSWORD, startStack, TestClient, type Stack } from './helpers';

let stack: Stack;
beforeAll(async () => {
  stack = await startStack();
});
afterAll(async () => {
  await stack.close();
});

describe('health', () => {
  it('is public and reports dependencies', async () => {
    const r = await stack.client().get('/health');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ status: 'ok', vms: 'up', keycloak: 'up' });
  });
});

describe('CSRF', () => {
  it('issues a token before login', async () => {
    const r = await stack.client().get('/auth/csrf');
    expect(r.status).toBe(200);
    expect(r.json.csrfToken).toMatch(/^[\w-]{40,}$/);
  });

  it('rejects a mutation without / with a wrong token (403 CSRF)', async () => {
    const c = stack.client();
    await c.fetchCsrf();
    const missing = await c.post('/auth/login', { email: 'admin@force5.com', password: PASSWORD }, { csrf: null });
    expect(missing.status).toBe(403);
    expect(missing.json.error.code).toBe('CSRF');
    const wrong = await c.post('/auth/login', { email: 'admin@force5.com', password: PASSWORD }, { csrf: 'nope' });
    expect(wrong.status).toBe(403);
    expect(wrong.json.error.code).toBe('CSRF');
  });

  it('rotates the token on login (the pre-login token stops working)', async () => {
    const c = stack.client();
    const before = await c.fetchCsrf();
    const r = await c.login('admin@force5.com');
    expect(r.json.session.csrfToken).not.toBe(before);
    const stale = await c.post('/auth/keepalive', undefined, { csrf: before });
    expect(stale.json.error.code).toBe('CSRF');
    const ok = await c.post('/auth/keepalive');
    expect(ok.status).toBe(200);
  });
});

describe('login state machine', () => {
  it('single tenant: ok, session cookie set, tokens never reach the browser', async () => {
    const c = stack.client();
    await c.fetchCsrf();
    const sidBefore = c.cookies.get('crm.sid');
    const r = await c.login('admin@force5.com');
    expect(r.status).toBe(200);
    expect(r.json.status).toBe('ok');
    expect(r.json.session).toMatchObject({
      user: { email: 'admin@force5.com', tenant: { id: 1 } },
      idleTimeoutMinutes: 60,
      environment: 'local',
    });
    expect(r.body).not.toMatch(/eyJ|access_?token|refresh_?token|mock-rt/i);
    // session id regenerated on login (fixation defence)
    expect(c.cookies.get('crm.sid')).toBeDefined();
    expect(c.cookies.get('crm.sid')).not.toBe(sidBefore);
    const cookieHeader = String(r.headers['set-cookie']);
    expect(cookieHeader).toMatch(/HttpOnly/i);
    expect(cookieHeader).toMatch(/SameSite=Strict/i);
    expect(cookieHeader).toMatch(/Path=\/crm/);
    // explicit expiry (iOS drops expiry-less cookies when the app is killed); rolling refresh
    expect(cookieHeader).toMatch(/Expires=/i);
    const s0 = await c.get('/auth/session');
    expect(String(s0.headers['set-cookie'])).toMatch(/Expires=/i);

    const s = await c.get('/auth/session');
    expect(s.status).toBe(200);
    expect(s.json.user.email).toBe('admin@force5.com');

    // Keycloak was asked with tenant_id=1, gk-admin; VMS authenticate got X-App-Id + Bearer
    const grant = stack.calls.find((x) => x.url.endsWith('/openid-connect/token'));
    expect(grant?.body).toMatchObject({ client_id: 'gk-admin', grant_type: 'password', tenant_id: '1' });
    const auth = stack.calls.find((x) => x.url.endsWith('/vms/internal/v1/authenticate'));
    expect(auth?.headers['x-app-id']).toBe('CRM_001');
    expect(String(auth?.headers.authorization)).toMatch(/^Bearer ey/);
    expect(auth?.body).toMatchObject({ email: 'admin@force5.com', tenantId: 1 });
  });

  it('bad password → 401 INVALID_CREDENTIALS', async () => {
    const r = await stack.client().login('admin@force5.com', 'wrong-password');
    expect(r.status).toBe(401);
    expect(r.json.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('VMS authenticate empty-200 is treated as invalid credentials', async () => {
    const c = stack.client();
    await c.loginOk();
    // Use the adapter directly with a valid token but a wrong password: VMS answers 200 + empty body.
    const tokenRes = await fetch(`${stack.mockUrl}/realms/gatekeeper/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: 'gk-admin', grant_type: 'password', username: 'admin@force5.com', password: PASSWORD, tenant_id: '1' }),
    }).then((r) => r.json() as Promise<{ access_token: string }>);
    const { VmsClient } = await import('../src/vms/client');
    const vms = new VmsClient({ baseUrl: `${stack.mockUrl}/vms/internal/v1/`, appId: 'CRM_001', timeoutMs: 5000 }, stack.app.log).bind({
      token: tokenRes.access_token,
      requestId: 'test-req-1',
    });
    expect(await authenticate(vms, { email: 'admin@force5.com', password: 'nope', tenantId: 1 })).toBeNull();
    expect(await authenticate(vms, { email: 'admin@force5.com', password: PASSWORD, tenantId: 1 })).toMatchObject({ id: 101 });
  });

  it('multi-tenant: picks an account without re-entering the password', async () => {
    const c = stack.client();
    const r = await c.login('multi@force5.com');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({
      status: 'select-account',
      accounts: [
        { id: 1, name: 'Force 5' },
        { id: 3, name: 'Apex Energy Services' },
      ],
    });
    expect(r.body).not.toContain(PASSWORD);
    // not signed in yet
    expect((await c.get('/accounts')).status).toBe(401);

    const sel = await c.post('/auth/select-account', { tenantId: 1 });
    expect(sel.status).toBe(200);
    expect(sel.json.status).toBe('ok');
    expect(sel.json.session.user.tenant.id).toBe(1);
    c.csrf = sel.json.session.csrfToken;
    expect((await c.get('/accounts')).status).toBe(200);

    const regrant = stack.calls.filter((x) => x.url.endsWith('/openid-connect/token')).at(-1);
    expect(regrant?.body).toMatchObject({ username: 'multi@force5.com', tenant_id: '1' });
  });

  it('multi-tenant: choosing a non-CRM tenant is rejected with 403', async () => {
    const c = stack.client();
    await c.login('multi@force5.com');
    const sel = await c.post('/auth/select-account', { tenantId: 3 });
    expect(sel.status).toBe(403);
    expect(sel.json.error.code).toBe('FORBIDDEN');
  });

  it('multi-tenant: the held password expires after 2 minutes and is one-shot', async () => {
    const c = stack.client();
    await c.login('multi@force5.com');
    const realNow = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(realNow + 2 * 60_000 + 1000);
    try {
      const sel = await c.post('/auth/select-account', { tenantId: 1 });
      expect(sel.status).toBe(401);
      expect(sel.json.error.code).toBe('UNAUTHENTICATED');
    } finally {
      spy.mockRestore();
    }
    const again = await c.post('/auth/select-account', { tenantId: 1 });
    expect(again.status).toBe(401);
  });

  it('MFA: no API access before verify; verify sends `passcode`', async () => {
    const c = stack.client();
    const r = await c.login('mfa@force5.com');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ status: 'mfa', channel: 'sms', destination: '•••-•••-0199' });

    // The session is NOT authenticated yet.
    expect((await c.get('/auth/session')).status).toBe(401);
    expect((await c.get('/accounts')).status).toBe(401);
    expect((await c.get('/profile')).status).toBe(401);

    const resend = await c.post('/auth/mfa/send');
    expect(resend.json).toEqual({ sent: true, destination: '•••-•••-0199' });

    const bad = await c.post('/auth/mfa/verify', { passcode: '000000' });
    expect(bad.status).toBe(400);
    expect(bad.json.error.fieldErrors.passcode).toBeDefined();
    expect((await c.get('/accounts')).status).toBe(401);

    const ok = await c.post('/auth/mfa/verify', { passcode: '123456' });
    expect(ok.status).toBe(200);
    expect(ok.json.status).toBe('ok');
    c.csrf = ok.json.session.csrfToken;
    expect((await c.get('/accounts')).status).toBe(200);

    const verifyCall = stack.calls.filter((x) => x.url.endsWith('/auth/verifyMfaCode')).at(-1);
    expect(verifyCall?.body).toEqual({ to: '+14045550199', passcode: '123456' });
    const sendCall = stack.calls.find((x) => x.url.endsWith('/auth/sendMfaCode'));
    expect(sendCall?.body).toMatchObject({ token: expect.stringMatching(/^au_/) });
  });

  it('non-CRM user (other tenant, no permission) → 403 and no session', async () => {
    const c = stack.client();
    // Northstar (tenant 2) requires MFA, so the D1 guard runs after the second factor.
    const m = await c.login('sales@customer.com');
    expect(m.json.status).toBe('mfa');
    const r = await c.post('/auth/mfa/verify', { passcode: '123456' });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('FORBIDDEN');
    expect((await c.get('/auth/session')).status).toBe(401);
    expect((await c.get('/accounts')).status).toBe(401);
  });

  it('logout destroys the session and revokes at Keycloak', async () => {
    const c = stack.client();
    await c.loginOk();
    const out = await c.post('/auth/logout');
    expect(out.status).toBe(204);
    expect((await c.get('/accounts')).status).toBe(401);
    expect(stack.calls.some((x) => x.url.endsWith('/openid-connect/logout'))).toBe(true);
  });

  it('writes a structured audit line for mutations', async () => {
    const c = stack.client();
    await c.loginOk();
    const line = stack.logs.find(
      (l) => (l.audit as { action?: string })?.action === 'auth.login' && (l.audit as { user?: string }).user === 'admin@force5.com',
    );
    expect(line?.audit).toMatchObject({ result: 'success', status: 200, tenant: 1, requestId: expect.any(String) });
  });
});

describe('forgot password', () => {
  it('forgot → verify → reset → login with the new password', async () => {
    const c = stack.client();
    await c.fetchCsrf();
    expect((await c.post('/auth/password/forgot', { email: 'nobody@nowhere.example' })).json).toEqual({ ok: true });
    expect((await c.post('/auth/password/forgot', { email: 'mfa@force5.com' })).json).toEqual({ ok: true });
    const wrong = await c.post('/auth/password/verify', { email: 'mfa@force5.com', code: '111111' });
    expect(wrong.status).toBe(400);
    expect(wrong.json.error.fieldErrors.code).toBeDefined();
    expect((await c.post('/auth/password/verify', { email: 'mfa@force5.com', code: '654321' })).status).toBe(200);
    const weak = await c.post('/auth/password/reset', { email: 'mfa@force5.com', code: '654321', password: 'weak', passwordConfirmation: 'weak' });
    expect(weak.status).toBe(400);
    const newPw = 'N3w!Password';
    const reset = await c.post('/auth/password/reset', {
      email: 'mfa@force5.com',
      code: '654321',
      password: newPw,
      passwordConfirmation: newPw,
    });
    expect(reset.status).toBe(200);
    const login = await stack.client().login('mfa@force5.com', newPw);
    expect(login.json.status).toBe('mfa');
  });
});

describe('token refresh', () => {
  it('refreshes lazily when ≤5 minutes remain', async () => {
    const short = await startStack({ mock: { accessTtlSeconds: 120 } });
    try {
      const c = short.client();
      await c.loginOk();
      const before = short.calls.filter((x) => (x.body as { grant_type?: string })?.grant_type === 'refresh_token').length;
      expect((await c.get('/accounts')).status).toBe(200);
      const refreshes = short.calls.filter((x) => (x.body as { grant_type?: string })?.grant_type === 'refresh_token');
      expect(refreshes.length).toBe(before + 1);
      expect(refreshes.at(-1)?.body).toMatchObject({ client_id: 'gk-admin', tenant_id: '1' });
    } finally {
      await short.close();
    }
  });
});

describe('Keycloak down', () => {
  it('login → 503 SERVICE_UNAVAILABLE "Service unavailable"', async () => {
    const config = loadConfig({ APP_ENV: 'local', KEYCLOAK_URL: 'http://127.0.0.1:9/realms/', VMS_URL: 'http://127.0.0.1:9/vms/internal/v1/' });
    const app = await buildApp(config, { logger: false });
    try {
      const c = new TestClient(app);
      const r = await c.login('admin@force5.com');
      expect(r.status).toBe(503);
      expect(r.json.error).toEqual({ code: 'SERVICE_UNAVAILABLE', message: 'Service unavailable' });
      const h = await c.get('/health');
      expect(h.json).toEqual({ status: 'degraded', vms: 'down', keycloak: 'down' });
    } finally {
      await app.close();
    }
  });
});

describe('rate limiting', () => {
  it('limits login attempts per email (429 RATE_LIMITED)', async () => {
    const limited = await startStack({ env: { LOGIN_RATE_LIMIT_PER_EMAIL: '3' } });
    try {
      const c = limited.client();
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) statuses.push((await c.login('admin@force5.com', 'wrong')).status);
      expect(statuses).toEqual([401, 401, 401, 429]);
      expect((await c.login('admin@force5.com', 'wrong')).json.error.code).toBe('RATE_LIMITED');
    } finally {
      await limited.close();
    }
  });

  it('limits login attempts per IP', async () => {
    const limited = await startStack({ env: { LOGIN_RATE_LIMIT_PER_MINUTE: '2' } });
    try {
      const c = limited.client();
      await c.fetchCsrf();
      const statuses: number[] = [];
      for (const email of ['a@x.example', 'b@x.example', 'c@x.example']) statuses.push((await c.login(email, 'wrong')).status);
      expect(statuses).toEqual([401, 401, 429]);
    } finally {
      await limited.close();
    }
  });
});

describe('security headers', () => {
  it('sends a strict CSP and friends', async () => {
    const r = await stack.client().get('/health');
    const csp = String(r.headers['content-security-policy']);
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain(stack.mockUrl); // local: mock-vms image origin
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-request-id']).toBeDefined();
  });
});
