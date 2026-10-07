import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PNG_DATA_URL, startStack, type Stack, type TestClient } from './helpers';

let stack: Stack;
let c: TestClient;
beforeAll(async () => {
  stack = await startStack();
  c = stack.client();
  await c.loginOk();
});
afterAll(async () => {
  await stack.close();
});

const lastCall = (re: RegExp) => stack.calls.filter((x) => re.test(x.url.split('?')[0]!)).at(-1);

describe('licenses', () => {
  it('lists with purchased/used mapping, incl. an over-allocated row', async () => {
    const r = await c.get('/accounts/5/licenses');
    expect(r.status).toBe(200);
    const kiosk = r.json.items.find((l: { productName: string }) => l.productName === 'Kiosk');
    expect(kiosk).toMatchObject({ purchasedCount: 10, usedCount: 14, licenseType: 'SUBSCRIPTION', licenseTypeDisplay: 'Subscription', active: true });
    const api = r.json.items.find((l: { productName: string }) => l.productName === 'API');
    expect(api).toMatchObject({ purchasedCount: null, licenseTypeDisplay: 'Usage Based' });
    expect(new URL(lastCall(/tenantProductLicense\/5$/)!.url, 'http://x').searchParams.getAll('sort')).toEqual(['productLicense.product.name,asc']);
  });

  it('available products exclude the ones already assigned', async () => {
    const r = await c.get('/accounts/5/licenses/available');
    const ids = r.json.map((p: { id: number }) => p.id);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(3);
    expect(r.json[0]).toHaveProperty('licenseTypeDisplay');
  });

  it('adds a license (numeric purchasedLicenseCount to VMS)', async () => {
    const r = await c.post('/accounts/5/licenses', { productLicenseId: 4, purchasedCount: '12' });
    expect(r.status).toBe(201);
    expect(r.json.license).toMatchObject({ productName: 'Mobile', purchasedCount: 12, usedCount: 0 });
    expect(lastCall(/tenantProductLicense\/5$/)?.body).toEqual({ productLicenseId: 4, purchasedLicenseCount: 12 });
    const after = await c.get('/accounts/5/licenses/available');
    expect(after.json.map((p: { id: number }) => p.id)).not.toContain(4);

    const bad = await c.post('/accounts/5/licenses', { productLicenseId: 7, purchasedCount: 0 });
    expect(bad.status).toBe(400);
    expect(bad.json.error.fieldErrors.purchasedCount).toBe('At least 1 seat');
  });

  it('PATCH /licenses/:id updates seats, active, or both (two VMS calls)', async () => {
    const seats = await c.patch('/licenses/3', { purchasedCount: 30 });
    expect(seats.status).toBe(200);
    expect(seats.json.license).toMatchObject({ id: 3, purchasedCount: 30 });
    expect(lastCall(/tenantProductLicense\/3$/)).toMatchObject({ method: 'PATCH', body: { purchasedLicenseCount: 30 } });

    const off = await c.patch('/licenses/3', { active: false });
    expect(off.json.license.active).toBe(false);

    const both = await c.patch('/licenses/3', { purchasedCount: 31, active: true });
    expect(both.json.license).toMatchObject({ purchasedCount: 31, active: true });
    const patches = stack.calls.filter((x) => x.method === 'PATCH' && x.url.endsWith('tenantProductLicense/3'));
    expect(patches.slice(-2).map((p) => p.body)).toEqual([{ purchasedLicenseCount: 31 }, { active: true }]);

    expect((await c.patch('/licenses/3', {})).status).toBe(400);
    expect((await c.patch('/licenses/3', { purchasedCount: 0 })).status).toBe(400);
  });
});

describe('products', () => {
  it('lists with name as secondary sort and maps category', async () => {
    const r = await c.get('/products?sort=productCode&dir=desc&status=all');
    expect(r.status).toBe(200);
    expect(r.json.total).toBe(7);
    expect(r.json.items[0]).toMatchObject({ productCode: 'REG_001', category: 'Platform', productCategoryId: 1 });
    expect(new URL(lastCall(/\/products$/)!.url, 'http://x').searchParams.getAll('sort')).toEqual(['productCode,desc', 'name,asc']);
  });

  it('create → update → deactivate → delete; in-use delete is a 409', async () => {
    const created = await c.post('/products', { name: 'Badge Printer', productCode: 'BDG_001', productCategoryId: 1, active: true });
    expect(created.status).toBe(201);
    const id = created.json.product.id;
    expect(created.json.product).toMatchObject({ name: 'Badge Printer', category: 'Platform' });

    const dupe = await c.post('/products', { name: 'Other', productCode: 'BDG_001', productCategoryId: 1 });
    expect(dupe.status).toBe(400);
    expect(dupe.json.error.fieldErrors.productCode).toBeDefined();

    const upd = await c.put(`/products/${id}`, { name: 'Badge Printer Pro', productCode: 'BDG_001', description: 'Prints badges', productCategoryId: 1 });
    expect(upd.json.product).toMatchObject({ name: 'Badge Printer Pro', description: 'Prints badges' });

    expect((await c.patch(`/products/${id}`, { active: false })).json.product.active).toBe(false);
    expect((await c.get(`/products/${id}`)).json.product.active).toBe(false);

    expect((await c.delete(`/products/${id}`)).json).toEqual({ deleted: true });
    expect((await c.get(`/products/${id}`)).status).toBe(404);

    const inUse = await c.delete('/products/1');
    expect(inUse.status).toBe(409);
    expect(inUse.json.error.code).toBe('CONFLICT');
  });

  it('new template has categories and no product', async () => {
    const r = await c.get('/products/new');
    expect(r.json.product).toBeNull();
    expect(r.json.categories.map((x: { label: string }) => x.label)).toEqual(['Platform', 'Mobile', 'Integration', 'Internal']);
  });
});

describe('profile', () => {
  it('loads from VMS and saves with the SESSION user id', async () => {
    const r = await c.get('/profile');
    expect(r.json.user).toMatchObject({ id: 101, email: 'admin@force5.com', stateId: 11 });
    expect(r.json.lookups.states.length).toBeGreaterThan(40);

    const saved = await c.put('/profile', { firstName: 'Charles', lastName: 'Cavaness', city: 'Marietta', id: 999 });
    expect(saved.status).toBe(200);
    expect(saved.json.user).toMatchObject({ firstName: 'Charles', city: 'Marietta' });
    expect(lastCall(/\/signedInUser\/\d+$/)?.url).toMatch(/signedInUser\/101$/);
    // session copy refreshed
    expect((await c.get('/auth/session')).json.user.firstName).toBe('Charles');
  });

  it('preferences → PATCH users/{id} (plural) for MFA; theme stays in the session (V15)', async () => {
    const r = await c.patch('/profile/preferences', { themeName: 'dark' });
    expect(r.status).toBe(200);
    expect(r.json.user.themeName).toBe('dark');
    expect(lastCall(/\/users\/101$/)).toBeUndefined(); // real VMS 500s on themeName
    expect((await c.get('/profile')).json.user.themeName).toBe('dark'); // survives a profile refresh

    const m = await c.patch('/profile/preferences', { mfaEnabled: false, mfaType: 'totp' });
    expect(m.status).toBe(200);
    expect(lastCall(/\/users\/101$/)).toMatchObject({ method: 'PATCH', body: { mfaEnabled: false, mfaType: 'totp' } });
    expect((await c.patch('/profile/preferences', {})).status).toBe(400);
  });

  it('photo upload/remove and TOTP enrolment', async () => {
    const up = await c.put('/profile/photo', { dataUrl: PNG_DATA_URL });
    expect(up.json.profileImageUrl).toMatch(/\/vms\/files\/profile-101-/);
    expect(lastCall(/updateProfileImage$/)?.body).toEqual({ base64Image: PNG_DATA_URL });
    expect((await c.delete('/profile/photo')).status).toBe(204);
    expect((await c.get('/profile')).json.user.profileImageUrl).toBeUndefined();

    const totp = await c.post('/profile/mfa/totp');
    expect(totp.json).toEqual({ uri: expect.stringMatching(/^otpauth:\/\/totp\//), secret: 'JBSWY3DPEHPK3PXP' });
    expect(lastCall(/registerTotp$/)?.body).toEqual({ identifier: 'admin@force5.com' });
  });
});
