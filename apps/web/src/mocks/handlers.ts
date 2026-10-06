import { http, HttpResponse, type HttpHandler } from 'msw';
import {
  availableSeats,
  type Account,
  type AccountFormData,
  type AccountSummary,
  type ApiError,
  type LoginResult,
  type Page,
  type Product,
  type TenantLicense,
} from '@crm/contracts';
import { ACCOUNT_LOOKUPS, COUNTRIES, LANGUAGES, PRODUCT_CATEGORIES, PROFILE_LOOKUPS, STATES, sessionOf, type MockDb } from './db';

/** Matches the BFF under any origin (relative in the browser, absolute in tests). */
const A = (path: string) => `*/crm/api${path}`;

const fail = (status: number, code: string, message: string, fieldErrors?: Record<string, string>): Response =>
  HttpResponse.json<ApiError>({ error: { code, message, fieldErrors } }, { status });

function paginate<T>(items: T[], url: URL): Page<T> {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const size = Math.max(1, Number(url.searchParams.get('size') ?? 20));
  const total = items.length;
  return { items: items.slice((page - 1) * size, page * size), page, size, total, totalPages: Math.max(1, Math.ceil(total / size)) };
}

function sortBy<T>(items: T[], url: URL, pick: (item: T, field: string) => string | number | boolean | undefined, fallback: string): T[] {
  const field = url.searchParams.get('sort') ?? fallback;
  const dir = url.searchParams.get('dir') === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const x = pick(a, field) ?? '';
    const y = pick(b, field) ?? '';
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
}

function statusFilter<T>(items: T[], url: URL, isActive: (t: T) => boolean): T[] {
  const status = url.searchParams.get('status') ?? 'active';
  if (status === 'all') return items;
  return items.filter((i) => (status === 'active' ? isActive(i) : !isActive(i)));
}

function summary(a: Account): AccountSummary {
  return {
    id: a.id,
    name: a.name,
    status: a.status,
    mainContact: a.mainContact,
    city: a.city,
    state: a.state,
    country: a.country,
    language: a.language,
    dateCreated: a.dateCreated,
  };
}

function applyForm(base: Account | null, id: number, f: AccountFormData, registered: boolean): Account {
  const now = new Date().toISOString();
  const active = f.active ?? true;
  return {
    id,
    name: f.name,
    status: registered ? (active ? 'active' : 'inactive') : 'draft',
    active,
    mainContact: { firstName: f.mainContactFirstName, lastName: f.mainContactLastName, email: f.mainContactEmail, mobile: f.mainContactMobile, phone: f.mainContactPhone },
    city: f.city,
    state: STATES.find((s) => s.value === Number(f.stateId))?.label,
    country: COUNTRIES.find((c) => c.value === Number(f.countryId))?.label,
    language: LANGUAGES.find((l) => l.value === Number(f.languageId))?.label,
    dateCreated: base?.dateCreated ?? now,
    registeredDate: registered ? base?.registeredDate ?? now : undefined,
    registeredBy: registered ? base?.registeredBy ?? 'Chuck Cavaness' : undefined,
    languageId: f.languageId === undefined ? undefined : Number(f.languageId),
    timeZoneName: f.timeZoneName,
    labelVerticalId: f.labelVerticalId ?? null,
    frameworkIds: f.frameworkIds ?? [],
    requireMfa: f.requireMfa ?? false,
    address: f.address,
    stateId: f.stateId === undefined ? undefined : Number(f.stateId),
    provinceOrRegion: f.provinceOrRegion,
    postalCode: f.postalCode,
    countryId: f.countryId === undefined ? undefined : Number(f.countryId),
    logoUrl: base?.logoUrl,
    signinBackgroundImageUrl: base?.signinBackgroundImageUrl,
    audit: { ...base?.audit, updatedBy: 'Chuck Cavaness', lastUpdated: now, dateCreated: base?.audit.dateCreated ?? now, createdBy: base?.audit.createdBy ?? 'Chuck Cavaness' },
  };
}

export function createHandlers(db: MockDb): HttpHandler[] {
  const requireAuth = () => (db.signedIn ? null : fail(401, 'UNAUTHENTICATED', 'Not signed in'));
  const findAccount = (id: string | readonly string[] | undefined) => db.accounts.find((a) => a.id === Number(id));

  return [
    // ---- auth ------------------------------------------------------------------------------------
    http.get(A('/auth/csrf'), () => HttpResponse.json({ csrfToken: 'csrf-test-token' })),
    http.get(A('/auth/session'), () => requireAuth() ?? HttpResponse.json(sessionOf(db))),
    http.post(A('/auth/login'), async ({ request }) => {
      const { email, password } = (await request.json()) as { email: string; password: string };
      if (email.startsWith('down')) return fail(503, 'SERVICE_UNAVAILABLE', 'Service unavailable');
      if (password !== 'Password1!') return fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      if (email.startsWith('multi')) {
        return HttpResponse.json<LoginResult>({ status: 'select-account', accounts: [{ id: 1, name: 'Force 5' }, { id: 2, name: 'Force 5 Labs' }] });
      }
      if (email.startsWith('mfa')) return HttpResponse.json<LoginResult>({ status: 'mfa', channel: 'sms', destination: '•••• 0199' });
      db.signedIn = true;
      return HttpResponse.json<LoginResult>({ status: 'ok', session: sessionOf(db) });
    }),
    http.post(A('/auth/select-account'), () => {
      db.signedIn = true;
      return HttpResponse.json<LoginResult>({ status: 'ok', session: sessionOf(db) });
    }),
    http.post(A('/auth/mfa/send'), () => HttpResponse.json({ sent: true, destination: '•••• 0199' })),
    http.post(A('/auth/mfa/verify'), async ({ request }) => {
      const { passcode } = (await request.json()) as { passcode: string };
      if (passcode !== '123456') return fail(400, 'VALIDATION', 'Invalid code');
      db.signedIn = true;
      return HttpResponse.json<LoginResult>({ status: 'ok', session: sessionOf(db) });
    }),
    http.post(A('/auth/keepalive'), () => requireAuth() ?? HttpResponse.json({ ok: true })),
    http.post(A('/auth/logout'), () => {
      db.signedIn = false;
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(A('/auth/password/forgot'), () => HttpResponse.json({ ok: true })),
    http.post(A('/auth/password/verify'), async ({ request }) => {
      const { code } = (await request.json()) as { code: string };
      return code === '1234' ? HttpResponse.json({ ok: true }) : fail(400, 'VALIDATION', 'Invalid code');
    }),
    http.post(A('/auth/password/reset'), () => HttpResponse.json({ ok: true })),

    // ---- dashboard ---------------------------------------------------------------------------------
    http.get(A('/dashboard'), () => {
      const denied = requireAuth();
      if (denied) return denied;
      const recent = [...db.accounts].sort((a, b) => (b.dateCreated ?? '').localeCompare(a.dateCreated ?? '')).slice(0, 5).map(summary);
      return HttpResponse.json({
        total: db.accounts.length,
        active: db.accounts.filter((a) => a.active).length,
        inactive: db.accounts.filter((a) => !a.active).length,
        draft: null,
        recent,
      });
    }),

    // ---- accounts ----------------------------------------------------------------------------------
    http.get(A('/accounts'), ({ request }) => {
      const denied = requireAuth();
      if (denied) return denied;
      const url = new URL(request.url);
      const q = (url.searchParams.get('search') ?? '').toLowerCase();
      let items = db.accounts.filter((a) =>
        [a.name, a.mainContact.firstName, a.mainContact.lastName, a.mainContact.email].some((v) => v?.toLowerCase().includes(q)),
      );
      items = statusFilter(items, url, (a) => a.active);
      items = sortBy(items, url, (a, f) => (f === 'mainContactLastName' ? a.mainContact.lastName : (a as unknown as Record<string, string>)[f]), 'name');
      return HttpResponse.json(paginate(items.map(summary), url));
    }),
    http.get(A('/accounts/new'), () => HttpResponse.json({ account: null, lookups: ACCOUNT_LOOKUPS })),
    http.get(A('/accounts/:id'), ({ params }) => {
      const a = findAccount(params.id);
      return a ? HttpResponse.json({ account: a, lookups: ACCOUNT_LOOKUPS }) : fail(404, 'NOT_FOUND', 'Account not found');
    }),
    http.post(A('/accounts'), async ({ request }) => {
      const { mode, account } = (await request.json()) as { mode: 'draft' | 'publish'; account: AccountFormData };
      const created = applyForm(null, db.nextId++, account, mode === 'publish');
      db.accounts.push(created);
      return HttpResponse.json({ account: created }, { status: 201 });
    }),
    http.put(A('/accounts/:id'), async ({ params, request }) => {
      const a = findAccount(params.id);
      if (!a) return fail(404, 'NOT_FOUND', 'Account not found');
      const { account } = (await request.json()) as { account: AccountFormData };
      const updated = applyForm(a, a.id, account, !!a.registeredDate);
      db.accounts = db.accounts.map((x) => (x.id === a.id ? updated : x));
      return HttpResponse.json({ account: updated });
    }),
    http.post(A('/accounts/:id/publish'), () => fail(501, 'NOT_SUPPORTED', 'Publishing an existing draft is not supported by VMS yet')),
    http.patch(A('/accounts/:id'), async ({ params, request }) => {
      const a = findAccount(params.id);
      if (!a) return fail(404, 'NOT_FOUND', 'Account not found');
      const { active } = (await request.json()) as { active: boolean };
      Object.assign(a, { active, status: a.registeredDate ? (active ? 'active' : 'inactive') : 'draft' });
      return HttpResponse.json({ account: summary(a) });
    }),
    http.put(A('/accounts/:id/logo'), async ({ params, request }) => {
      const a = findAccount(params.id);
      if (!a) return fail(404, 'NOT_FOUND', 'Account not found');
      const { dataUrl } = (await request.json()) as { dataUrl: string };
      a.logoUrl = dataUrl;
      return HttpResponse.json({ url: dataUrl });
    }),
    http.put(A('/accounts/:id/signin-image'), async ({ params, request }) => {
      const a = findAccount(params.id);
      if (!a) return fail(404, 'NOT_FOUND', 'Account not found');
      const { dataUrl } = (await request.json()) as { dataUrl: string };
      a.signinBackgroundImageUrl = dataUrl;
      return HttpResponse.json({ url: dataUrl });
    }),

    // ---- licenses ----------------------------------------------------------------------------------
    http.get(A('/accounts/:id/licenses/available'), ({ params }) => {
      const assigned = new Set((db.licenses[Number(params.id)] ?? []).map((l) => l.productName));
      return HttpResponse.json(db.catalog.filter((p) => !assigned.has(p.productName)));
    }),
    http.get(A('/accounts/:id/licenses'), ({ params, request }) => {
      const url = new URL(request.url);
      const q = (url.searchParams.get('search') ?? '').toLowerCase();
      let items = (db.licenses[Number(params.id)] ?? []).filter((l) => l.productName.toLowerCase().includes(q));
      items = statusFilter(items, url, (l) => l.active);
      items = sortBy(items, url, (l, f) => (l as unknown as Record<string, string>)[f], 'productName');
      return HttpResponse.json(paginate(items, url));
    }),
    http.post(A('/accounts/:id/licenses'), async ({ params, request }) => {
      const { productLicenseId, purchasedCount } = (await request.json()) as { productLicenseId: number; purchasedCount: number };
      const p = db.catalog.find((c) => c.id === productLicenseId);
      if (!p) return fail(400, 'VALIDATION', 'Unknown product', { productLicenseId: 'Choose a product' });
      const license: TenantLicense = { ...p, id: db.nextId++, purchasedCount: Number(purchasedCount), usedCount: 0, active: true };
      (db.licenses[Number(params.id)] ??= []).push(license);
      return HttpResponse.json({ license }, { status: 201 });
    }),
    http.patch(A('/licenses/:id'), async ({ params, request }) => {
      const body = (await request.json()) as { purchasedCount?: number; active?: boolean };
      for (const list of Object.values(db.licenses)) {
        const l = list.find((x) => x.id === Number(params.id));
        if (l) {
          if (body.purchasedCount !== undefined) l.purchasedCount = Number(body.purchasedCount);
          if (body.active !== undefined) l.active = body.active;
          void availableSeats(l);
          return HttpResponse.json({ license: l });
        }
      }
      return fail(404, 'NOT_FOUND', 'License not found');
    }),

    // ---- products ----------------------------------------------------------------------------------
    http.get(A('/products'), ({ request }) => {
      const url = new URL(request.url);
      const q = (url.searchParams.get('search') ?? '').toLowerCase();
      let items = db.products.filter((p) => p.name.toLowerCase().includes(q) || (p.productCode ?? '').toLowerCase().includes(q));
      items = statusFilter(items, url, (p) => p.active);
      items = sortBy(items, url, (p, f) => (p as unknown as Record<string, string>)[f], 'name');
      return HttpResponse.json(paginate(items, url));
    }),
    http.get(A('/products/new'), () => HttpResponse.json({ product: null, categories: PRODUCT_CATEGORIES })),
    http.get(A('/products/:id'), ({ params }) => {
      const p = db.products.find((x) => x.id === Number(params.id));
      return p ? HttpResponse.json({ product: p, categories: PRODUCT_CATEGORIES }) : fail(404, 'NOT_FOUND', 'Product not found');
    }),
    http.post(A('/products'), async ({ request }) => {
      const body = (await request.json()) as Omit<Product, 'id'>;
      const now = new Date().toISOString();
      const p: Product = { ...body, id: db.nextId++, category: PRODUCT_CATEGORIES.find((c) => c.value === body.productCategoryId)?.label, audit: { createdBy: 'Chuck Cavaness', dateCreated: now } };
      db.products.push(p);
      return HttpResponse.json({ product: p }, { status: 201 });
    }),
    http.put(A('/products/:id'), async ({ params, request }) => {
      const p = db.products.find((x) => x.id === Number(params.id));
      if (!p) return fail(404, 'NOT_FOUND', 'Product not found');
      const body = (await request.json()) as Omit<Product, 'id'>;
      if (body.productCode === 'DUPLICATE') return fail(409, 'CONFLICT', 'Product code already exists', { productCode: 'This product code is already in use' });
      Object.assign(p, body, {
        category: PRODUCT_CATEGORIES.find((c) => c.value === body.productCategoryId)?.label,
        audit: { ...p.audit, updatedBy: 'Chuck Cavaness', lastUpdated: new Date().toISOString() },
      });
      return HttpResponse.json({ product: p });
    }),
    http.patch(A('/products/:id'), async ({ params, request }) => {
      const p = db.products.find((x) => x.id === Number(params.id));
      if (!p) return fail(404, 'NOT_FOUND', 'Product not found');
      const { active } = (await request.json()) as { active: boolean };
      p.active = active;
      return HttpResponse.json({ product: p });
    }),
    http.delete(A('/products/:id'), ({ params }) => {
      db.products = db.products.filter((x) => x.id !== Number(params.id));
      return HttpResponse.json({ deleted: true });
    }),

    // ---- profile -----------------------------------------------------------------------------------
    http.get(A('/profile'), () => requireAuth() ?? HttpResponse.json({ user: db.user, lookups: PROFILE_LOOKUPS })),
    http.put(A('/profile'), async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      db.user = { ...db.user, ...body } as typeof db.user;
      return HttpResponse.json({ user: db.user, lookups: PROFILE_LOOKUPS });
    }),
    http.patch(A('/profile/preferences'), async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      db.user = { ...db.user, ...body } as typeof db.user;
      return HttpResponse.json({ user: db.user });
    }),
    http.put(A('/profile/photo'), async ({ request }) => {
      const { dataUrl } = (await request.json()) as { dataUrl: string };
      db.user = { ...db.user, profileImageUrl: dataUrl };
      return HttpResponse.json({ profileImageUrl: dataUrl });
    }),
    http.delete(A('/profile/photo'), () => {
      db.user = { ...db.user, profileImageUrl: undefined };
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(A('/profile/mfa/totp'), () =>
      HttpResponse.json({ uri: 'otpauth://totp/Force5:chuck@force5.example?secret=JBSWY3DPEHPK3PXP&issuer=Force5', secret: 'JBSWY3DPEHPK3PXP' }),
    ),
  ];
}
