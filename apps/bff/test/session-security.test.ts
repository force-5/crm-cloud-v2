import { describe, expect, it } from 'vitest';
import { ANONYMOUS_SESSION_TTL_MS, TtlMemoryStore } from '../src/auth/session';
import { MemorySharedState } from '../src/auth/shared-state';
import { fullAccountForm, startStack } from './helpers';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Regressions for the security review's confirmed findings (M1–M3), reproduced the way the reviewer probed them. */
describe('session security', () => {
  it('M1: a request in flight during logout cannot revive the session', async () => {
    const stack = await startStack({ mock: { latencyMs: [150, 150] } });
    try {
      const c = stack.client();
      await c.loginOk();
      const cookieAtLogin = c.cookies.get('crm.sid')!;

      const slow = c.put('/accounts/1', { account: fullAccountForm() }); // several sequential VMS calls
      await sleep(40);
      expect((await c.post('/auth/logout')).status).toBe(204);
      await slow; // finishes AFTER the logout and writes its session copy back

      c.cookies.set('crm.sid', cookieAtLogin); // a thief replays the pre-logout cookie
      expect((await c.get('/auth/session')).status).toBe(401);
    } finally {
      await stack.close();
    }
  });

  it('M2: parallel wrong MFA codes are capped at 5 VMS checks, then the login is void', async () => {
    const stack = await startStack();
    try {
      const c = stack.client();
      expect((await c.login('mfa@force5.com')).json.status).toBe('mfa');
      const results = await Promise.all(
        Array.from({ length: 30 }, (_, i) => c.post('/auth/mfa/verify', { passcode: String(100000 + i) })),
      );
      const vmsChecks = stack.calls.filter((x) => x.url.endsWith('/auth/verifyMfaCode')).length;
      expect(vmsChecks).toBeLessThanOrEqual(5);
      expect(results.filter((r) => r.status === 401).length).toBeGreaterThanOrEqual(25);
      // The pending login is gone: even the right code no longer works.
      expect((await c.post('/auth/mfa/verify', { passcode: '123456' })).status).toBe(401);
    } finally {
      await stack.close();
    }
  });

  it('M2: the select-account password is strictly one-shot under parallel requests', async () => {
    const stack = await startStack();
    try {
      const c = stack.client();
      const r = await c.login('multi@force5.com');
      expect(r.json.status).toBe('select-account');
      const tenantId = r.json.accounts[0].id;
      const picks = await Promise.all(Array.from({ length: 10 }, () => c.post('/auth/select-account', { tenantId })));
      const grants = stack.calls.filter((x) => x.url.includes('openid-connect/token')).length;
      // 1 grant for the initial login + at most 1 for the pick.
      expect(grants).toBeLessThanOrEqual(2);
      expect(picks.filter((p) => p.status === 200).length).toBeLessThanOrEqual(1);
    } finally {
      await stack.close();
    }
  });

  it('M3: /auth/csrf is rate limited per IP', async () => {
    const stack = await startStack();
    try {
      const statuses = await Promise.all(
        Array.from({ length: 40 }, () => stack.app.inject({ method: 'GET', url: '/crm/api/auth/csrf' }).then((r) => r.statusCode)),
      );
      expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    } finally {
      await stack.close();
    }
  });

  it('M3: anonymous sessions are short-lived and evicted first; signed-in sessions are kept', () => {
    const store = new TtlMemoryStore(60 * 60_000, 3);
    const put = (id: string, s: object) => store.set(id, s as never, () => undefined);
    put('user', { auth: { user: {} } });
    for (let i = 0; i < 10; i++) put(`anon${i}`, { csrfToken: 'x' });
    expect(store.size).toBeLessThanOrEqual(3);
    let kept: unknown = null;
    store.get('user', (_e, s) => (kept = s));
    expect(kept).not.toBeNull();
    expect(ANONYMOUS_SESSION_TTL_MS).toBeLessThanOrEqual(5 * 60_000);
  });

  it('shared counters and tombstones expire and stay bounded', async () => {
    const shared = new MemorySharedState(5);
    expect(await shared.incr('k', 50)).toBe(1);
    expect(await shared.incr('k', 50)).toBe(2);
    await shared.revoke('sid', 50);
    expect(await shared.isRevoked('sid')).toBe(true);
    await sleep(60);
    expect(await shared.incr('k', 50)).toBe(1);
    expect(await shared.isRevoked('sid')).toBe(false);
    for (let i = 0; i < 20; i++) await shared.incr(`flood${i}`, 60_000);
    // Bounded: older keys were dropped to stay under the cap.
    expect(await shared.incr('flood0', 60_000)).toBe(1);
  });
});
