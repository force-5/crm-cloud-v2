import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startStack, type Stack, type TestClient } from './helpers';

/**
 * The mock with MOCK_VMS_REAL_BUGS on reproduces the real-VMS bugs found against local vmsServer on
 * 2026-10-06 (docs/VMS_CHANGE_REQUESTS.md). These tests pin down how the CRM behaves until VMS fixes
 * them: a clear, specific error, and no data damage or crash. When a VMS fix lands, the matching test
 * here should be updated or deleted.
 */
describe('CRM behaviour against today’s real-VMS bugs', () => {
  let stack: Stack;
  let c: TestClient;

  beforeAll(async () => {
    stack = await startStack({ mock: { realBugs: true } });
    c = stack.client();
    await c.loginOk();
  });
  afterAll(() => stack.close());

  it('V2: save-as-draft fails with a clean 5xx error (and VMS leaves an orphan tenant)', async () => {
    const before = stack.mock.db.tenants.length;
    const r = await c.post('/accounts', { mode: 'draft', account: { name: 'V2 Draft Probe' } });
    expect(r.status).toBeGreaterThanOrEqual(500);
    expect(r.json.error).toMatchObject({ code: expect.any(String), message: expect.any(String) });
    // The orphan is VMS's doing (the row is saved before the cast fails) — documented, not hidden.
    expect(stack.mock.db.tenants.length).toBe(before + 1);
  });

  it('V3: publishing an existing draft says it needs VMS change V3 and changes nothing', async () => {
    const draft = stack.mock.db.tenants.find((t) => t.registeredDate === null && t.name !== 'V2 Draft Probe')!;
    const { lookups } = (await c.get('/accounts/new')).json;
    const us = lookups.countries.find((x: { code?: string }) => x.code === 'US');
    const ga = lookups.states.find((x: { code?: string }) => x.code === 'GA');
    const r = await c.post(`/accounts/${draft.id}/publish`, {
      account: {
        name: draft.name,
        languageId: lookups.languages[0].value,
        timeZoneName: lookups.timeZones[0].value,
        mainContactFirstName: 'Pat',
        mainContactLastName: 'Lee',
        mainContactEmail: 'pat@example.com',
        mainContactMobile: '+1 404 555 0100',
        countryId: us.value,
        stateId: ga.value,
        address: '1 Main St',
        city: 'Atlanta',
        postalCode: '30303',
      },
    });
    expect(r.status).toBe(501);
    expect(r.json.error).toMatchObject({ code: 'NOT_SUPPORTED', message: expect.stringContaining('V3') });
    expect(stack.mock.db.tenants.find((t) => t.id === draft.id)!.registeredDate).toBeNull();
  });

  it('V14: the product form loads with no categories, and saving without one is a field error', async () => {
    const form = await c.get('/products/new');
    expect(form.status).toBe(200);
    expect(form.json.categories).toEqual([]);

    const r = await c.post('/products', { name: 'Probe', productCode: 'PRB_1', active: true });
    expect(r.status).toBe(400);
    expect(r.json.error.fieldErrors).toEqual({ productCategoryId: 'Category is required' });
  });

  it('V14: product lists and details still load, just without a category name', async () => {
    const list = await c.get('/products?status=all');
    expect(list.status).toBe(200);
    expect(list.json.items.length).toBeGreaterThan(0);
    const detail = await c.get(`/products/${list.json.items[0].id}`);
    expect(detail.status).toBe(200);
    expect(detail.json.product.category).toBeUndefined();
  });

  it('V15: changing the theme still works for the session and never calls VMS', async () => {
    const r = await c.patch('/profile/preferences', { themeName: 'dark' });
    expect(r.status).toBe(200);
    expect(r.json.user.themeName).toBe('dark');
    expect((await c.get('/auth/session')).json.user.themeName).toBe('dark');
    const themeCalls = stack.calls.filter((x) => x.method === 'PATCH' && /\/users\/\d+$/.test(x.url));
    expect(themeCalls).toEqual([]);
  });

  it('F5: the recovery code VMS leaks in user responses never reaches the client', async () => {
    const admin = stack.mock.db.users.find((u) => u.email === 'admin@force5.com')!;
    admin.passwordRecoveryCode = '999999';
    const session = await c.get('/auth/session');
    const profile = await c.get('/profile');
    expect(JSON.stringify(session.json)).not.toContain('999999');
    expect(JSON.stringify(profile.json)).not.toContain('999999');
    admin.passwordRecoveryCode = null;
  });
});
