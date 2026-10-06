import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fullAccountForm, PNG_DATA_URL, startStack, type Stack, type TestClient } from './helpers';

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

const vmsCalls = (suffix: RegExp) => stack.calls.filter((x) => suffix.test(x.url.split('?')[0]!));

describe('account list', () => {
  it('pages (1-based), filters by status and never leaks secrets', async () => {
    const r = await c.get('/accounts?page=2&size=10&status=all&sort=name');
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ page: 2, size: 10, total: 29, totalPages: 3 });
    expect(r.json.items).toHaveLength(10);
    expect(r.body).not.toMatch(/defaultPassword|registrationCode|registrationUrl|Welcome-/);

    const last = stack.calls.filter((x) => x.url.includes('/vms/internal/v1/tenants')).at(-1)!;
    const qs = new URL(last.url, 'http://x').searchParams;
    expect(qs.get('page')).toBe('1');
    expect(qs.get('size')).toBe('10');
    expect(qs.getAll('sort')).toEqual(['name,asc']);
    expect(qs.has('active')).toBe(false);

    const inactive = await c.get('/accounts?status=inactive&size=50');
    expect(inactive.json.items.length).toBeGreaterThan(0);
    expect(inactive.json.items.every((a: { status: string }) => a.status === 'inactive' || a.status === 'draft')).toBe(true);
    expect(inactive.json.items.map((a: { name: string }) => a.name)).toContain('Coastal Infrastructure');
  });

  it('searches and sorts by main contact (last, then first name)', async () => {
    const r = await c.get('/accounts?search=northstar');
    expect(r.json.items.map((a: { name: string }) => a.name)).toEqual(['Northstar Construction']);
    await c.get('/accounts?sort=mainContact&dir=desc');
    const last = stack.calls.filter((x) => x.url.includes('/tenants?')).at(-1)!;
    expect(new URL(last.url, 'http://x').searchParams.getAll('sort')).toEqual([
      'mainContactLastName,desc',
      'mainContactFirstName,desc',
    ]);
  });

  it('derives Draft status (Blue Ridge Power has no registeredDate)', async () => {
    const r = await c.get('/accounts?search=Blue%20Ridge&status=all');
    expect(r.json.items[0]).toMatchObject({ name: 'Blue Ridge Power', status: 'draft' });
  });

  it('dashboard: real counts, draft null, 5 most recent', async () => {
    const r = await c.get('/dashboard');
    expect(r.status).toBe(200);
    expect(r.json.draft).toBeNull();
    expect(r.json.total).toBe(r.json.active + r.json.inactive);
    expect(r.json.recent).toHaveLength(5);
    const dates = r.json.recent.map((a: { dateCreated: string }) => a.dateCreated);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

describe('account detail', () => {
  it('returns the account and AccountLookups', async () => {
    const r = await c.get('/accounts/2');
    expect(r.status).toBe(200);
    expect(r.json.account).toMatchObject({ id: 2, name: 'Northstar Construction', status: 'active', requireMfa: true, labelVerticalId: 1 });
    expect(r.json.lookups.timeZones.length).toBeGreaterThanOrEqual(30);
    expect(r.json.lookups.countries.find((x: { code: string }) => x.code === 'US')).toBeDefined();
    expect(r.json.lookups.frameworks[0]).toEqual({ value: 1, label: 'Visitor' });
    expect(r.json.lookups.labelVerticals.map((v: { name: string }) => v.name)).toContain('Healthcare');
    expect(r.body).not.toMatch(/defaultPassword|registrationCode/);
  });

  it('new template', async () => {
    const r = await c.get('/accounts/new');
    expect(r.json.account).toBeNull();
    expect(r.json.lookups.languages.length).toBeGreaterThan(0);
  });

  it('404 for unknown / non-numeric ids', async () => {
    expect((await c.get('/accounts/99999')).json.error.code).toBe('NOT_FOUND');
    expect((await c.get('/accounts/abc')).status).toBe(404);
  });
});

describe('create', () => {
  it('draft needs only a name', async () => {
    const r = await c.post('/accounts', { mode: 'draft', account: { name: 'Draft Only Co' } });
    expect(r.status).toBe(201);
    expect(r.json.account).toMatchObject({ name: 'Draft Only Co', status: 'draft' });
    expect(vmsCalls(/\/tenant\/draft$/).length).toBe(1);
  });

  it('draft without a name → 400 VALIDATION with fieldErrors.name (no VMS call)', async () => {
    const before = stack.calls.length;
    const r = await c.post('/accounts', { mode: 'draft', account: { name: '  ', mainContactEmail: 'not-an-email' } });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('VALIDATION');
    expect(Object.keys(r.json.error.fieldErrors).sort()).toEqual(['mainContactEmail', 'name']);
    expect(stack.calls.length).toBe(before);
  });

  it('publish runs full validation (country rules: US needs a state and a ZIP)', async () => {
    const r = await c.post('/accounts', {
      mode: 'publish',
      account: { name: 'Incomplete Inc', countryId: 1, postalCode: 'ABC' },
    });
    expect(r.status).toBe(400);
    expect(r.json.error.fieldErrors).toMatchObject({
      languageId: expect.any(String),
      timeZoneName: expect.any(String),
      mainContactEmail: expect.any(String),
      mainContactMobile: expect.any(String),
      stateId: 'State is required',
      postalCode: expect.stringContaining('ZIP'),
    });
    expect(vmsCalls(/\/tenant\/setup\/publish$/).length).toBe(0);
  });

  it('publish creates a registered account; never sends an id in the body', async () => {
    const r = await c.post('/accounts', { mode: 'publish', account: fullAccountForm({ name: 'Published Co' }) });
    expect(r.status).toBe(201);
    expect(r.json.account).toMatchObject({ name: 'Published Co', status: 'active', frameworkIds: [1, 2], labelVerticalId: 1 });
    expect(r.json.account.registeredDate).toBeDefined();
    const call = vmsCalls(/\/tenant\/setup\/publish$/).at(-1)!;
    expect(call.body).not.toHaveProperty('id');
    expect(call.body).toMatchObject({ name: 'Published Co', mainContactEmail: 'pat@test.example', stateId: 11 });
  });

  it('surfaces VMS field errors (duplicate name)', async () => {
    const r = await c.post('/accounts', { mode: 'draft', account: { name: 'Northstar Construction' } });
    expect(r.status).toBe(400);
    expect(r.json.error.fieldErrors.name).toMatch(/already exists/);
  });
});

describe('update and publish existing', () => {
  it('draft update → PUT account/setup/draft/update/{id}; registered update → account/setup/update/{id}', async () => {
    const draft = await c.post('/accounts', { mode: 'draft', account: { name: 'Edit Me Draft' } });
    const id = draft.json.account.id;
    const upd = await c.put(`/accounts/${id}`, { account: { name: 'Edit Me Draft', city: 'Macon' } });
    expect(upd.status).toBe(200);
    expect(upd.json.account).toMatchObject({ city: 'Macon', status: 'draft' });
    expect(vmsCalls(new RegExp(`/account/setup/draft/update/${id}$`)).length).toBe(1);

    // Registered: full validation applies
    const bad = await c.put('/accounts/2', { account: { name: 'Northstar Construction' } });
    expect(bad.status).toBe(400);
    const ok = await c.put('/accounts/2', {
      account: fullAccountForm({ name: 'Northstar Construction', requireMfa: false, active: true, frameworkIds: [3] }),
    });
    expect(ok.status).toBe(200);
    expect(ok.json.account).toMatchObject({ requireMfa: false, frameworkIds: [3], status: 'active' });
    expect(vmsCalls(/\/account\/setup\/update\/2$/).length).toBe(1);
  });

  it('publishes an existing draft via tenant/setup/publish/{id}', async () => {
    const draft = await c.post('/accounts', { mode: 'draft', account: { name: 'Publish Later LLC' } });
    const id = draft.json.account.id;
    const incomplete = await c.post(`/accounts/${id}/publish`, { account: { name: 'Publish Later LLC' } });
    expect(incomplete.status).toBe(400);
    const r = await c.post(`/accounts/${id}/publish`, { account: fullAccountForm({ name: 'Publish Later LLC' }) });
    expect(r.status).toBe(200);
    expect(r.json.account).toMatchObject({ id, status: 'active' });
    const again = await c.post(`/accounts/${id}/publish`, { account: fullAccountForm({ name: 'Publish Later LLC' }) });
    expect(again.status).toBe(409);
  });

  it('returns 501 NOT_SUPPORTED when VMS lacks publish/{id} (V3)', async () => {
    const legacy = await startStack({ mock: { supportPublishDraft: false } });
    try {
      const lc = legacy.client();
      await lc.loginOk();
      const r = await lc.post('/accounts/4/publish', {
        account: fullAccountForm({ name: 'Blue Ridge Power' }),
      });
      expect(r.status).toBe(501);
      expect(r.json.error).toEqual({ code: 'NOT_SUPPORTED', message: 'Publishing an existing draft needs VMS change V3' });
    } finally {
      await legacy.close();
    }
  });

  it('activate / deactivate with PATCH', async () => {
    const off = await c.patch('/accounts/7', { active: false });
    expect(off.status).toBe(200);
    expect(off.json.account).toMatchObject({ id: 7, status: 'inactive' });
    expect(vmsCalls(/\/tenant\/7$/).at(-1)).toMatchObject({ method: 'PATCH', body: { active: false } });
    expect((await c.patch('/accounts/7', { active: true })).json.account.status).toBe('active');
    expect((await c.patch('/accounts/7', { active: 'yes' })).status).toBe(400);
  });

  it('requires CSRF on account mutations', async () => {
    const r = await c.post('/accounts', { mode: 'draft', account: { name: 'No CSRF' } }, { csrf: null });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('CSRF');
  });
});

describe('images', () => {
  it('uploads a logo and sign-in image (raw data URL to VMS) and returns a URL', async () => {
    const r = await c.put('/accounts/2/logo', { dataUrl: PNG_DATA_URL });
    expect(r.status).toBe(200);
    expect(r.json.url).toMatch(new RegExp(`^${stack.mockUrl}/vms/files/logo-2-`));
    const call = vmsCalls(/\/tenant\/uploadLogo\/2$/).at(-1)!;
    expect(call.body).toBe(PNG_DATA_URL);
    const img = await fetch(r.json.url);
    expect(img.headers.get('content-type')).toBe('image/png');

    const s = await c.put('/accounts/2/signin-image', { dataUrl: PNG_DATA_URL });
    expect(s.json.url).toMatch(/signin-2-/);
    expect((await c.get('/accounts/2')).json.account.logoUrl).toBe(r.json.url);
  });

  it('rejects non-image data', async () => {
    const r = await c.put('/accounts/2/logo', { dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' });
    expect(r.status).toBe(400);
    expect(r.json.error.fieldErrors.dataUrl).toMatch(/PNG, JPEG or WebP/);
  });
});
