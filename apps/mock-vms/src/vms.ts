import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken, type KeyMaterial } from './keycloak';
import {
  LICENSE_TYPES,
  MFA_PASSCODE,
  RECOVERY_CODE,
  type Db,
  type Product,
  type Tenant,
  type TenantLicense,
  type User,
} from './seed';

export type VmsOptions = {
  /** Origin the mock is reachable at, used to build file URLs (e.g. http://localhost:8090). */
  publicUrl: string;
  /** When false, `POST tenant/setup/publish/{id}` 404s like the real VMS today (V3). */
  supportPublishDraft: boolean;
  log: (msg: string) => void;
};

type Principal = { email: string; tenantId: number; user: User | undefined };

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export const VMS_PREFIX = '/vms/internal/v1';

// ---------------------------------------------------------------------------
// Serialization helpers — produce the JSON shapes the real VMS returns.
// ---------------------------------------------------------------------------

/** java.util.Date as Spring Boot's Jackson writes it. */
const springDate = (iso: string | null) => (iso ? new Date(iso).toISOString().replace('Z', '+00:00') : null);

const encodeToken = (prefix: string, id: number) => `${prefix}_${Buffer.from(String(id).padStart(12, '0')).toString('base64')}`;
const decodeToken = (token: string | undefined): number | null => {
  if (!token || token.length < 4) return null;
  const n = Number(Buffer.from(token.slice(3), 'base64').toString());
  return Number.isFinite(n) ? n : null;
};

const now = () => new Date().toISOString();

function apiError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  errors?: { field: string | null; message: string }[],
) {
  return reply.code(status).send({
    code,
    message,
    timestamp: new Date().toISOString().replace('Z', ''),
    correlationId: reply.request.headers['x-request-id'] ?? null,
    ...(errors ? { errors } : {}),
  });
}

type Query = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const all = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/**
 * Spring Data `Pageable` + `search` + `active` emulation. Returns the Spring "VIA_DTO" page shape:
 * `{content: [...], page: {size, number, totalElements, totalPages}}`.
 */
function paged<T>(
  reply: FastifyReply,
  q: Query,
  items: T[],
  opts: {
    search: (t: T) => (string | null | undefined)[];
    active: (t: T) => boolean;
    sortable: Record<string, (t: T) => unknown>;
    serialize: (t: T) => unknown;
  },
) {
  let rows = items;
  const search = first(q.search)?.trim().toLowerCase();
  if (search) rows = rows.filter((r) => opts.search(r).some((v) => v?.toLowerCase().includes(search)));
  const active = first(q.active);
  if (active === 'true' || active === 'false') rows = rows.filter((r) => opts.active(r) === (active === 'true'));

  const sorts = all(q.sort).map((s) => {
    const [field, dir] = s.split(',');
    return { field: field!, dir: (dir ?? 'asc').toLowerCase() === 'desc' ? -1 : 1 };
  });
  for (const s of sorts) {
    if (!opts.sortable[s.field]) {
      apiError(reply, 400, 'VALIDATION_ERROR', `No property '${s.field}' found for type`);
      return undefined;
    }
  }
  if (sorts.length) {
    rows = [...rows].sort((a, b) => {
      for (const s of sorts) {
        const get = opts.sortable[s.field]!;
        const av = get(a);
        const bv = get(b);
        if (av === bv) continue;
        if (av === null || av === undefined) return 1; // nulls last
        if (bv === null || bv === undefined) return -1;
        const c = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv, 'en', { sensitivity: 'base' }) : av < bv ? -1 : av > bv ? 1 : 0;
        if (c !== 0) return c * s.dir;
      }
      return 0;
    });
  }
  const size = Math.min(Math.max(Number(first(q.size) ?? 20) || 20, 1), 2000);
  const page = Math.max(Number(first(q.page) ?? 0) || 0, 0);
  const totalElements = rows.length;
  return {
    content: rows.slice(page * size, page * size + size).map(opts.serialize),
    page: { size, number: page, totalElements, totalPages: Math.ceil(totalElements / size) },
  };
}

function parseDataUrl(raw: string) {
  const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(raw.trim().replace(/^"|"$/g, ''));
  if (!m) return null;
  return { contentType: m[1]!, data: Buffer.from(m[2]!, 'base64') };
}

const e164 = (phone: string | null) => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
};

// ---------------------------------------------------------------------------

export function registerVms(app: FastifyInstance, db: Db, keys: KeyMaterial, opts: VmsOptions) {
  const lang = (id: number | null) => db.languages.find((l) => l.id === id) ?? null;
  const country = (id: number | null) => {
    const c = db.countries.find((x) => x.id === id);
    return c ? { id: c.id, code: c.code, description: c.description } : null;
  };
  const state = (id: number | null) => db.states.find((s) => s.id === id) ?? null;
  const category = (id: number | null) => db.productCategories.find((c) => c.id === id) ?? null;

  const supportingLists = () => ({
    supportedLanguages: db.languages,
    states: db.states,
    country: db.countries.map(({ id, code, description }) => ({ id, code, description })),
    supportedTimeZones: db.timeZones,
    notificationCategories: [],
    framework: db.frameworks.map((f) => ({
      id: null,
      value: String(f.id),
      text: f.name,
      description: null,
      group: null,
      disabled: false,
    })),
    availableDashboards: [],
  });

  /** TenantSetupDto as VMS serializes it — INCLUDING secrets (defaultPassword, registration*). */
  const tenantDto = (t: Tenant) => ({
    id: t.id,
    token: encodeToken('te', t.id),
    name: t.name,
    address: t.address,
    city: t.city,
    state: state(t.stateId),
    stateId: t.stateId,
    postalCode: t.postalCode,
    provinceOrRegion: t.provinceOrRegion,
    country: country(t.countryId),
    countryId: t.countryId,
    timeZoneName: t.timeZoneName,
    mainContactFirstName: t.mainContactFirstName,
    mainContactLastName: t.mainContactLastName,
    mainContactEmail: t.mainContactEmail,
    mainContactPhone: t.mainContactPhone,
    mainContactMobile: t.mainContactMobile,
    mainContactFullName: `${t.mainContactFirstName} ${t.mainContactLastName}`,
    securityRealm: 'gatekeeper',
    requireMfa: t.requireMfa,
    signinLogoImageUrl: t.signinLogoImageUrl,
    signinBackgroundImageUrl: t.signinBackgroundImageUrl,
    logoUrl: t.logoUrl,
    notificationLogo: null,
    language: lang(t.languageId),
    languageId: t.languageId,
    mfaEnabled: false,
    mfaType: null,
    registeredDate: springDate(t.registeredDate),
    registeredBy: t.registeredBy,
    createdBy: t.createdBy,
    dateCreated: t.dateCreated,
    updatedBy: t.updatedBy,
    lastUpdated: t.lastUpdated,
    active: t.active,
    siteTheme: null,
    siteThemeId: null,
    themeMode: null,
    registrationCode: t.registrationCode,
    registrationUrl: t.registrationUrl,
    registrationQrCode: t.registrationQrCode,
    defaultPersonId: null,
    defaultDashboardId: null,
    defaultPassword: t.defaultPassword,
    defaultSecurityRoleId: 1,
    accessCode: t.accessCode,
    identityRetentionDays: 365,
    reportRetentionDays: 365,
    dataDeletionType: null,
    dataDeletionEnabled: false,
    frameworkIds: t.frameworkIds,
    frameworkNames: t.frameworkIds.map((id) => db.frameworks.find((f) => f.id === id)?.name).filter(Boolean),
    frameworks: t.frameworkIds.map((id) => db.frameworks.find((f) => f.id === id)).filter(Boolean),
    activeFrameworkNames: t.frameworkIds.map((id) => db.frameworks.find((f) => f.id === id)?.name).filter(Boolean),
    wizardShown: false,
    labelVerticalId: t.labelVerticalId,
    brandColor: null,
    clearPassword: null,
    facilities: null,
  });

  const userDto = (u: User, withTenant = true) => {
    const t = db.tenants.find((x) => x.id === u.tenantId)!;
    return {
      id: u.id,
      token: encodeToken('au', u.id),
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      mobilePhone: u.mobilePhone,
      officePhone: u.officePhone,
      address: u.address,
      postalCode: u.postalCode,
      city: u.city,
      isFirstLogin: false,
      themeMode: u.themeName, // VMS exposes `themeMode`; PATCH users/{id} writes `themeName`.
      tenantId: u.tenantId,
      country: country(u.countryId),
      state: state(u.stateId),
      stateId: u.stateId,
      countryId: u.countryId,
      provinceOrRegion: null,
      language: lang(u.languageId),
      languageId: u.languageId,
      persona: null,
      personaId: null,
      sidebarOpen: true,
      roles: u.roles,
      securityRoles: u.roles,
      notifyViaEmail: true,
      notifyViaSMS: false,
      securityPermissions: u.permissions,
      pendingAgreements: [],
      passwordChangeRequired: false,
      ...(withTenant ? { tenant: tenantDto(t) } : {}),
      timeZoneName: u.timeZoneName,
      mfaEnabled: u.mfaEnabled,
      mfaType: u.mfaType,
      profileImageUrl: u.profileImageUrl,
      active: u.active,
      createdBy: u.createdBy,
      dateCreated: u.dateCreated,
      updatedBy: u.updatedBy,
      lastUpdated: u.lastUpdated,
    };
  };

  const productDto = (p: Product) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    productCode: p.productCode,
    productVersion: p.productVersion,
    productSku: p.productSku,
    productCategory: category(p.productCategoryId),
    productCategoryId: p.productCategoryId,
    active: p.active,
    createdBy: p.createdBy,
    dateCreated: p.dateCreated,
    updatedBy: p.updatedBy,
    lastUpdated: p.lastUpdated,
  });

  const licenseParts = (productLicenseId: number) => {
    const pl = db.productLicenses.find((x) => x.id === productLicenseId)!;
    const p = db.products.find((x) => x.id === pl.productId)!;
    return { pl, p };
  };

  const tenantLicenseDto = (tl: TenantLicense) => {
    const { pl, p } = licenseParts(tl.productLicenseId);
    return {
      id: tl.id,
      productName: p.name,
      description: p.description,
      productCode: p.productCode,
      productSku: p.productSku,
      category: category(p.productCategoryId)?.description ?? null,
      licenseType: pl.licenseType,
      licenseTypeDisplay: LICENSE_TYPES[pl.licenseType],
      licenseCount: tl.licenseCount,
      registeredLicenseCount: tl.registeredLicenseCount,
      active: tl.active,
      dateCreated: tl.dateCreated,
      createdBy: tl.createdBy,
      lastUpdated: tl.lastUpdated,
      updatedBy: tl.updatedBy,
    };
  };

  const principalName = (req: FastifyRequest) =>
    req.principal?.user ? `${req.principal.user.firstName} ${req.principal.user.lastName}` : 'unknown';

  // Accept the raw data-URL bodies the image endpoints take (`@RequestBody String`), whatever the
  // content type the caller declares.
  app.addContentTypeParser(['text/plain'], { parseAs: 'string', bodyLimit: 12 * 1024 * 1024 }, (_r, body, done) =>
    done(null, body),
  );
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 12 * 1024 * 1024 }, (_r, body, done) => {
    const s = body as string;
    if (s.trim() === '') return done(null, undefined);
    try {
      done(null, JSON.parse(s));
    } catch {
      if (s.trim().startsWith('data:')) return done(null, s);
      const err = new Error('Malformed JSON') as Error & { statusCode: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // ---- files (served publicly so the SPA can render uploaded images) -------
  app.get('/vms/files/:key', async (req, reply) => {
    const file = db.files.get((req.params as { key: string }).key);
    if (!file) return reply.code(404).send();
    return reply.header('Content-Type', file.contentType).header('Cache-Control', 'public, max-age=3600').send(file.data);
  });

  const storeImage = (kind: string, id: number, raw: unknown) => {
    if (typeof raw !== 'string') return null;
    const parsed = parseDataUrl(raw);
    if (!parsed) return null;
    const ext = parsed.contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin';
    const key = `${kind}-${id}-${Date.now()}.${ext}`;
    db.files.set(key, parsed);
    return `${opts.publicUrl}/vms/files/${key}`;
  };

  // ---- authentication of VMS routes ----------------------------------------
  const PUBLIC = [/^\/ping$/, /^\/authenticate$/, /^\/auth\//, /^\/passwordRecovery\//, /^\/account\/setup\//];

  app.register(
    async (vms) => {
      vms.addHook('onRequest', async (req, reply) => {
        const path = req.url.slice(VMS_PREFIX.length).split('?')[0]!;
        const header = req.headers.authorization;
        const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
        if (token) {
          try {
            const claims = await verifyAccessToken(keys, token);
            const user = db.users.find(
              (u) => u.email.toLowerCase() === claims.email.toLowerCase() && u.tenantId === claims.tenant_id,
            );
            req.principal = { email: claims.email, tenantId: claims.tenant_id, user };
          } catch {
            if (!PUBLIC.some((r) => r.test(path))) return reply.code(401).header('WWW-Authenticate', 'Bearer error="invalid_token"').send();
          }
        }
        if (!req.principal && !PUBLIC.some((r) => r.test(path))) {
          return reply.code(401).header('WWW-Authenticate', 'Bearer').send();
        }
      });

      // ---- system ----------------------------------------------------------
      vms.get('/ping', async () => ({ status: 'UP', time: now() }));

      // ---- authentication --------------------------------------------------
      vms.post('/authenticate', async (req, reply) => {
        const b = (req.body ?? {}) as { email?: string; password?: string; tenantId?: number };
        const user = db.users.find(
          (u) =>
            u.active &&
            u.email.toLowerCase() === (b.email ?? '').toLowerCase() &&
            u.password === b.password &&
            u.tenantId === Number(b.tenantId),
        );
        // Real VMS quirk (V11): bad credentials => HTTP 200 with an EMPTY body.
        if (!user) return reply.code(200).header('Content-Type', 'application/json').send('');
        return { user: userDto(user) };
      });

      vms.post('/auth/sendMfaCode', async (req) => {
        const b = (req.body ?? {}) as { token?: string };
        const user = db.users.find((u) => u.id === decodeToken(b.token));
        if (!user) return { valid: false, status: null, to: null, channel: null };
        if (user.mfaType === 'totp' || user.mfaType === 'topt') {
          return { valid: true, status: 'pending', to: user.email, channel: 'totp' };
        }
        const to = e164(user.mobilePhone);
        if (!to) return { valid: false, status: null, to: null, channel: null }; // email channel is a TODO in VMS
        opts.log(`[mock-vms] MFA code for ${user.email} -> ${to}: ${MFA_PASSCODE}`);
        return { valid: true, status: 'pending', to, channel: 'sms', passcode: null };
      });

      vms.post('/auth/verifyMfaCode', async (req) => {
        const b = (req.body ?? {}) as { to?: string; passcode?: string; code?: string };
        // VMS reads `passcode`; the old CRM sent `code`, which is never valid.
        const ok = b.passcode === MFA_PASSCODE;
        return { valid: ok, status: ok ? 'approved' : 'pending', to: b.to ?? null, channel: 'sms' };
      });

      vms.post('/auth/registerTotp', async (req) => {
        const b = (req.body ?? {}) as { identifier?: string };
        const secret = 'JBSWY3DPEHPK3PXP';
        const label = encodeURIComponent(`Force 5 Inc:${b.identifier ?? 'user'}`);
        return {
          factorFriendlyName: 'Force 5 Inc',
          status: 'unverified',
          channel: 'totp',
          uri: `otpauth://totp/${label}?secret=${secret}&issuer=Force%205%20Inc&algorithm=SHA1&digits=6&period=30`,
          valid: false,
        };
      });

      // ---- password recovery -----------------------------------------------
      vms.post('/passwordRecovery/forgot', async (req) => {
        const b = (req.body ?? {}) as { email?: string };
        const users = db.users.filter((u) => u.email.toLowerCase() === (b.email ?? '').toLowerCase());
        if (!users.length) return { email: b.email, status: 'FAILURE', error: 'User not found' };
        users.forEach((u) => (u.passwordRecoveryCode = RECOVERY_CODE));
        opts.log(`[mock-vms] Password recovery code for ${b.email}: ${RECOVERY_CODE}`);
        return { email: b.email, status: 'SUCCESS', messageType: 'EMAIL', mobileLast4: users[0]!.mobilePhone?.slice(-4) ?? null };
      });

      vms.post('/passwordRecovery/verify', async (req) => {
        const b = (req.body ?? {}) as { email?: string; passwordRecoveryCode?: string };
        const ok = db.users.some(
          (u) => u.email.toLowerCase() === (b.email ?? '').toLowerCase() && u.passwordRecoveryCode && u.passwordRecoveryCode === b.passwordRecoveryCode,
        );
        return ok
          ? { email: b.email, status: 'SUCCESS' }
          : { email: b.email, status: 'FAILURE', error: 'Recovery code did not match' };
      });

      // NB: like the real VMS, `update` does not re-check the recovery code — the BFF verifies first.
      vms.post('/passwordRecovery/update', async (req) => {
        const b = (req.body ?? {}) as { email?: string; password?: string; passwordConfirmation?: string };
        if (!b.password || b.password !== b.passwordConfirmation) {
          return { email: b.email, status: 'FAILURE', error: 'Passwords did not match' };
        }
        const users = db.users.filter((u) => u.email.toLowerCase() === (b.email ?? '').toLowerCase());
        users.forEach((u) => {
          u.password = b.password!;
          u.passwordRecoveryCode = null;
        });
        return users.length ? { email: b.email, status: 'SUCCESS' } : { email: b.email, status: 'FAILURE', error: 'Password Not Updated' };
      });

      // ---- signed in user / users -----------------------------------------
      vms.get('/signedInUser', async (req) => ({
        user: req.principal?.user ? userDto(req.principal.user) : null,
        supportingLists: { ...supportingLists(), roles: [], personas: [], areas: [] },
      }));

      vms.put('/signedInUser/:id', async (req, reply) => {
        // Faithful to VMS: the id is NOT checked against the caller (the BFF must use the session id).
        const user = db.users.find((u) => u.id === Number((req.params as { id: string }).id));
        if (!user) return apiError(reply, 404, 'NOT_FOUND', 'No user found');
        const b = (req.body ?? {}) as Partial<User>;
        if (b.firstName !== undefined && !String(b.firstName).trim()) {
          return apiError(reply, 400, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'firstName', message: 'must not be blank' }]);
        }
        for (const k of ['firstName', 'lastName', 'mobilePhone', 'address', 'city', 'countryId', 'stateId', 'postalCode', 'languageId', 'timeZoneName'] as const) {
          if (k in b) (user as Record<string, unknown>)[k] = (b as Record<string, unknown>)[k] ?? null;
        }
        user.updatedBy = req.principal?.email ?? null;
        user.lastUpdated = now();
        return { user: userDto(user), supportingLists: supportingLists() };
      });

      vms.patch('/users/:id', async (req, reply) => {
        const user = db.users.find((u) => u.id === Number((req.params as { id: string }).id));
        if (!user) return reply.code(404).send();
        const b = (req.body ?? {}) as Record<string, unknown>;
        if ('themeName' in b) user.themeName = b.themeName as string;
        if ('mfaType' in b) user.mfaType = b.mfaType as string;
        if ('mfaEnabled' in b) user.mfaEnabled = Boolean(b.mfaEnabled);
        if ('active' in b) user.active = Boolean(b.active);
        user.lastUpdated = now();
        return userDto(user, false);
      });

      vms.patch('/users/:id/updateProfileImage', async (req, reply) => {
        const user = db.users.find((u) => u.id === Number((req.params as { id: string }).id));
        if (!user) return apiError(reply, 404, 'NOT_FOUND', 'No user found');
        const url = storeImage('profile', user.id, (req.body as { base64Image?: string })?.base64Image);
        if (!url) return apiError(reply, 400, 'VALIDATION_ERROR', 'Invalid image');
        user.profileImageUrl = url;
        return { profileImageUrl: url };
      });

      vms.patch('/users/:id/removeProfileImage', async (req, reply) => {
        const user = db.users.find((u) => u.id === Number((req.params as { id: string }).id));
        if (user) user.profileImageUrl = null;
        return reply.code(204).send();
      });

      // ---- tenants ---------------------------------------------------------
      const tenantPage = {
        search: (t: Tenant) => [t.name, t.mainContactFirstName, t.mainContactLastName, t.mainContactEmail, t.city],
        active: (t: Tenant) => t.active,
        sortable: {
          id: (t: Tenant) => t.id,
          name: (t: Tenant) => t.name,
          mainContactLastName: (t: Tenant) => t.mainContactLastName,
          mainContactFirstName: (t: Tenant) => t.mainContactFirstName,
          mainContactEmail: (t: Tenant) => t.mainContactEmail,
          city: (t: Tenant) => t.city,
          dateCreated: (t: Tenant) => t.dateCreated,
          registeredDate: (t: Tenant) => t.registeredDate,
          active: (t: Tenant) => t.active,
        } as Record<string, (t: Tenant) => unknown>,
        serialize: tenantDto,
      };

      vms.get('/tenants', async (req, reply) => paged(reply, req.query as Query, db.tenants, tenantPage));
      vms.get('/tenant/supportingLists', async () => supportingLists());
      vms.get('/tenant/new', async () => ({
        tenant: { ...Object.fromEntries(Object.keys(tenantDto(db.tenants[0]!)).map((k) => [k, null])), active: true, requireMfa: false, frameworkIds: [] },
        supportingLists: supportingLists(),
      }));
      vms.get('/tenant', async (req) => {
        const t = db.tenants.find((x) => x.id === req.principal?.tenantId)!;
        return { tenant: tenantDto(t), supportingLists: supportingLists() };
      });
      vms.get('/labelVerticals', async () => ({ verticals: db.labelVerticals }));

      const findTenant = (id: string) => db.tenants.find((t) => t.id === Number(id));

      vms.get('/tenant/:id/detail', async (req, reply) => {
        const t = findTenant((req.params as { id: string }).id);
        if (!t) return apiError(reply, 404, 'NOT_FOUND', 'No tenant found with id');
        return { tenant: tenantDto(t), supportingLists: supportingLists() };
      });

      const EDITABLE = [
        'name', 'address', 'city', 'stateId', 'postalCode', 'provinceOrRegion', 'countryId', 'timeZoneName', 'languageId',
        'mainContactFirstName', 'mainContactLastName', 'mainContactEmail', 'mainContactPhone', 'mainContactMobile',
        'requireMfa', 'active', 'frameworkIds', 'labelVerticalId',
      ] as const;

      const applyDto = (t: Tenant, dto: Record<string, unknown>, by: string) => {
        for (const k of EDITABLE) {
          if (!(k in dto)) continue;
          const v = dto[k];
          (t as Record<string, unknown>)[k] = k === 'frameworkIds' ? (Array.isArray(v) ? v.map(Number) : []) : (v ?? (k === 'requireMfa' ? false : k === 'active' ? true : null));
        }
        if (!('languageId' in dto) && (dto.language as { id?: number } | undefined)?.id) t.languageId = (dto.language as { id: number }).id;
        t.updatedBy = by;
        t.lastUpdated = now();
      };

      const validateTenant = (reply: FastifyReply, dto: Record<string, unknown>, selfId: number | null, publish: boolean) => {
        const errors: { field: string; message: string }[] = [];
        const name = typeof dto.name === 'string' ? dto.name.trim() : '';
        if (!name) errors.push({ field: 'name', message: 'must not be blank' });
        else if (db.tenants.some((t) => t.id !== selfId && t.name.toLowerCase() === name.toLowerCase())) {
          errors.push({ field: 'name', message: 'An account with this name already exists' });
        }
        if (publish && !dto.mainContactEmail) errors.push({ field: 'mainContactEmail', message: 'must not be blank' });
        if (errors.length) {
          apiError(reply, 400, 'VALIDATION_ERROR', 'Request validation failed', errors);
          return false;
        }
        return true;
      };

      const newTenant = (dto: Record<string, unknown>, by: string): Tenant => {
        const id = Math.max(...db.tenants.map((t) => t.id)) + 1;
        const t: Tenant = {
          id,
          name: '',
          address: null, city: null, stateId: null, postalCode: null, provinceOrRegion: null, countryId: null,
          timeZoneName: null, languageId: null,
          mainContactFirstName: null, mainContactLastName: null, mainContactEmail: null, mainContactPhone: null, mainContactMobile: null,
          requireMfa: false, active: true, logoUrl: null, signinLogoImageUrl: null, signinBackgroundImageUrl: null,
          registeredDate: null, registeredBy: null, accessCode: `AC${2000 + id}`,
          defaultPassword: null, registrationCode: `RC-${id}-${Math.floor(Math.random() * 1e6)}`,
          registrationUrl: `https://admin.force5-dev.com/accountSetup/start/${Buffer.from(String(id)).toString('base64')}`,
          registrationQrCode: null, frameworkIds: [], labelVerticalId: null,
          createdBy: by, dateCreated: now(), updatedBy: null, lastUpdated: null,
        };
        applyDto(t, dto, by);
        t.updatedBy = null;
        t.lastUpdated = null;
        db.tenants.push(t);
        return t;
      };

      /** What VMS's TenantSetupService does on publish (heavily abbreviated). */
      const provision = (t: Tenant, by: string) => {
        t.registeredDate = now();
        t.registeredBy = by;
        t.defaultPassword = `Welcome-${randomUUID().slice(0, 8)}`;
        let tlId = Math.max(0, ...db.tenantLicenses.map((x) => x.id));
        for (const plId of [3, 1]) {
          if (!db.tenantLicenses.some((x) => x.tenantId === t.id && x.productLicenseId === plId)) {
            db.tenantLicenses.push({
              id: ++tlId, tenantId: t.id, productLicenseId: plId, licenseCount: 25, registeredLicenseCount: plId === 1 ? 1 : 0,
              active: true, createdBy: by, dateCreated: now(), updatedBy: null, lastUpdated: null,
            });
          }
        }
        if (t.mainContactEmail && !db.users.some((u) => u.tenantId === t.id && u.email === t.mainContactEmail)) {
          db.users.push({
            id: Math.max(...db.users.map((u) => u.id)) + 1,
            tenantId: t.id,
            email: t.mainContactEmail,
            password: t.defaultPassword,
            firstName: t.mainContactFirstName ?? '',
            lastName: t.mainContactLastName ?? '',
            mobilePhone: t.mainContactMobile, officePhone: t.mainContactPhone, address: t.address, city: t.city,
            stateId: t.stateId, postalCode: t.postalCode, countryId: t.countryId, languageId: t.languageId,
            timeZoneName: t.timeZoneName, themeName: 'system', mfaEnabled: false, mfaType: null, profileImageUrl: null,
            roles: [db.roles.ADMIN_ROLE], permissions: [], passwordRecoveryCode: null, active: true,
            createdBy: by, dateCreated: now(), updatedBy: null, lastUpdated: null,
          });
        }
        const frameworks = t.frameworkIds.map((id) => db.frameworks.find((f) => f.id === id)?.name).join(', ') || 'none';
        opts.log(
          `[mock-vms] Published tenant ${t.id} "${t.name}": admin user ${t.mainContactEmail}, facility, kiosks for [${frameworks}], ` +
            `KIOSK+ADMIN licenses (25), label vertical ${t.labelVerticalId ?? 'none'}; welcome email -> ${t.mainContactEmail}`,
        );
      };

      vms.post('/tenant/draft', async (req, reply) => {
        const dto = (req.body ?? {}) as Record<string, unknown>;
        if (!validateTenant(reply, dto, null, false)) return reply;
        const t = newTenant(dto, req.principal!.email);
        return { tenant: tenantDto(t), supportingLists: supportingLists() };
      });

      vms.put('/account/setup/draft/update/:id', async (req, reply) => {
        const t = findTenant((req.params as { id: string }).id);
        if (!t) return apiError(reply, 404, 'NOT_FOUND', 'No tenant found with id');
        const dto = (req.body ?? {}) as Record<string, unknown>;
        if (!validateTenant(reply, { name: t.name, ...dto }, t.id, false)) return reply;
        applyDto(t, dto, req.principal?.email ?? 'anonymous');
        return tenantDto(t); // bare TenantSetupDto
      });

      vms.put('/account/setup/update/:id', async (req, reply) => {
        const t = findTenant((req.params as { id: string }).id);
        if (!t) return apiError(reply, 404, 'NOT_FOUND', 'No tenant found with id');
        const dto = (req.body ?? {}) as Record<string, unknown>;
        if (!validateTenant(reply, { name: t.name, ...dto }, t.id, false)) return reply;
        applyDto(t, dto, req.principal?.email ?? 'anonymous');
        return tenantDto(t);
      });

      vms.post('/tenant/setup/publish', async (req, reply) => {
        const dto = (req.body ?? {}) as Record<string, unknown>;
        if (dto.id != null) {
          // Real VMS bug (V3): an id in the body updates the CALLER's own tenant. Reproduced on purpose.
          const own = db.tenants.find((t) => t.id === req.principal!.tenantId)!;
          opts.log(`[mock-vms] WARNING tenant/setup/publish called with an id: overwriting caller's tenant ${own.id}`);
          applyDto(own, dto, req.principal!.email);
          return { tenant: tenantDto(own), supportingLists: supportingLists() };
        }
        if (!validateTenant(reply, dto, null, true)) return reply;
        const t = newTenant(dto, req.principal!.email);
        provision(t, principalName(req));
        return { tenant: tenantDto(t), supportingLists: supportingLists() };
      });

      // ⚠ MOCK-ONLY ENDPOINT — does not exist in the real VMS yet (change request V3).
      vms.post('/tenant/setup/publish/:id', async (req, reply) => {
        if (!opts.supportPublishDraft) return apiError(reply, 404, 'NOT_FOUND', 'No static resource internal/v1/tenant/setup/publish.');
        const t = findTenant((req.params as { id: string }).id);
        if (!t) return apiError(reply, 404, 'NOT_FOUND', 'No tenant found with id');
        if (t.registeredDate) return apiError(reply, 409, 'CONFLICT', 'Tenant is already published');
        const dto = { ...((req.body ?? {}) as Record<string, unknown>) };
        delete dto.id;
        if (!validateTenant(reply, { ...tenantDto(t), ...dto }, t.id, true)) return reply;
        applyDto(t, dto, req.principal!.email);
        provision(t, principalName(req));
        return { tenant: tenantDto(t), supportingLists: supportingLists() };
      });

      vms.patch('/tenant/:id', async (req, reply) => {
        const t = findTenant((req.params as { id: string }).id);
        if (!t) return apiError(reply, 404, 'NOT_FOUND', 'No tenant found with id');
        const b = (req.body ?? {}) as Record<string, unknown>;
        if ('active' in b) t.active = Boolean(b.active);
        t.updatedBy = req.principal!.email;
        t.lastUpdated = now();
        return tenantDto(t);
      });

      vms.put('/tenant/uploadLogo/:id', async (req, reply) => {
        const t = findTenant((req.params as { id: string }).id);
        if (!t) return apiError(reply, 404, 'NOT_FOUND', 'No tenant found with id');
        const url = storeImage('logo', t.id, req.body);
        if (!url) return apiError(reply, 400, 'VALIDATION_ERROR', 'Invalid image');
        t.logoUrl = url;
        t.signinLogoImageUrl = url;
        return { logoUrl: url };
      });

      vms.put('/tenant/uploadSigninImage/:id', async (req, reply) => {
        const t = findTenant((req.params as { id: string }).id);
        if (!t) return apiError(reply, 404, 'NOT_FOUND', 'No tenant found with id');
        const url = storeImage('signin', t.id, req.body);
        if (!url) return apiError(reply, 400, 'VALIDATION_ERROR', 'Invalid image');
        t.signinBackgroundImageUrl = url;
        return { imageUrl: url };
      });

      // ---- tenant product licenses ----------------------------------------
      const licenseRow = (tl: TenantLicense) => tenantLicenseDto(tl);
      type Row = ReturnType<typeof licenseRow>;
      vms.get('/tenantProductLicense/:tenantId', async (req, reply) => {
        const tenantId = Number((req.params as { tenantId: string }).tenantId);
        if (!Number.isFinite(tenantId)) return apiError(reply, 400, 'VALIDATION_ERROR', 'tenantId is required');
        const rows = db.tenantLicenses.filter((tl) => tl.tenantId === tenantId).map(licenseRow);
        return paged<Row>(reply, req.query as Query, rows, {
          search: (r) => [r.productName, r.productCode, r.productSku, r.description, r.category],
          active: (r) => r.active,
          // Real VMS sorts on TenantProductLicense entity paths; DTO names like `productName` → 500.
          sortable: {
            'productLicense.product.name': (r) => r.productName,
            'productLicense.licenseType.description': (r) => r.licenseTypeDisplay,
            'productLicense.product.productCategory.description': (r) => r.category,
            'productLicense.product.productCode': (r) => r.productCode,
            purchasedLicenseCount: (r) => r.licenseCount,
            registeredLicenseCount: (r) => r.registeredLicenseCount,
            active: (r) => r.active,
            dateCreated: (r) => r.dateCreated,
          },
          serialize: (r) => r,
        });
      });

      vms.get('/productLicenses', async (req) => {
        const tenantId = Number((req.query as Query).tenantId);
        const existing = new Set(db.tenantLicenses.filter((tl) => tl.tenantId === tenantId && tl.active).map((tl) => tl.productLicenseId));
        return db.productLicenses
          .filter((pl) => pl.active && !existing.has(pl.id))
          .map((pl) => {
            const p = db.products.find((x) => x.id === pl.productId)!;
            return {
              id: pl.id,
              productName: p.name,
              description: p.description,
              productCode: p.productCode,
              productSku: p.productSku,
              category: category(p.productCategoryId)?.description ?? null,
              licenseType: pl.licenseType,
              licenseTypeDisplay: LICENSE_TYPES[pl.licenseType],
            };
          });
      });

      vms.post('/tenantProductLicense/:tenantId', async (req, reply) => {
        const tenantId = Number((req.params as { tenantId: string }).tenantId);
        const b = (req.body ?? {}) as { productLicenseId?: unknown; purchasedLicenseCount?: unknown };
        if (!findTenant(String(tenantId))) return apiError(reply, 404, 'NOT_FOUND', `No tenant found with id: ${tenantId}`);
        const pl = db.productLicenses.find((x) => x.id === Number(b.productLicenseId));
        if (!pl) return apiError(reply, 404, 'NOT_FOUND', `No ProductLicense found with id: ${String(b.productLicenseId)}`);
        const count = Number(b.purchasedLicenseCount);
        if (!Number.isInteger(count)) return apiError(reply, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again later.');
        const tl: TenantLicense = {
          id: Math.max(0, ...db.tenantLicenses.map((x) => x.id)) + 1,
          tenantId,
          productLicenseId: pl.id,
          licenseCount: count,
          registeredLicenseCount: 0,
          active: true,
          createdBy: req.principal!.email,
          dateCreated: now(),
          updatedBy: null,
          lastUpdated: null,
        };
        db.tenantLicenses.push(tl);
        return tenantLicenseDto(tl);
      });

      vms.patch('/tenantProductLicense/:id', async (req, reply) => {
        const tl = db.tenantLicenses.find((x) => x.id === Number((req.params as { id: string }).id));
        if (!tl) return apiError(reply, 404, 'NOT_FOUND', 'No TenantProductLicense found');
        const b = (req.body ?? {}) as Record<string, unknown>;
        // Faithful: VMS applies `active` if present, otherwise `purchasedLicenseCount` — never both.
        if ('active' in b) tl.active = String(b.active) === 'true';
        else if ('purchasedLicenseCount' in b) tl.licenseCount = parseInt(String(b.purchasedLicenseCount), 10);
        else return reply.code(204).send();
        tl.updatedBy = req.principal!.email;
        tl.lastUpdated = now();
        return tenantLicenseDto(tl);
      });

      // ---- products --------------------------------------------------------
      const productLists = () => ({ productCategories: db.productCategories });
      vms.get('/products', async (req, reply) =>
        paged(reply, req.query as Query, db.products, {
          search: (p) => [p.name, p.description, p.productCode, p.productSku],
          active: (p) => p.active,
          sortable: {
            id: (p) => p.id,
            name: (p) => p.name,
            description: (p) => p.description,
            productCode: (p) => p.productCode,
            productSku: (p) => p.productSku,
            productVersion: (p) => p.productVersion,
            'productCategory.description': (p) => category(p.productCategoryId)?.description,
            active: (p) => p.active,
          },
          serialize: productDto,
        }),
      );
      vms.get('/products/create', async () => ({
        product: { id: null, name: null, description: null, productCode: null, productVersion: null, productSku: null, productCategory: null, productCategoryId: null, active: true },
        supportingLists: productLists(),
      }));
      const findProduct = (id: string) => db.products.find((p) => p.id === Number(id));
      const productDetail = async (req: FastifyRequest, reply: FastifyReply) => {
        const p = findProduct((req.params as { id: string }).id);
        if (!p) return apiError(reply, 404, 'NOT_FOUND', 'No product found');
        return { product: productDto(p), supportingLists: productLists() };
      };
      vms.get('/products/:id', productDetail);
      vms.get('/products/:id/detail', productDetail);

      const applyProduct = (p: Product, b: Record<string, unknown>) => {
        for (const k of ['name', 'description', 'productCode', 'productVersion', 'productSku', 'active'] as const) {
          if (k in b) (p as Record<string, unknown>)[k] = b[k] ?? (k === 'active' ? true : null);
        }
        const catId = b.productCategoryId ?? (b.productCategory as { id?: number } | undefined)?.id;
        if (catId !== undefined) p.productCategoryId = catId === null ? null : Number(catId);
      };
      const validateProduct = (reply: FastifyReply, b: Record<string, unknown>, selfId: number | null) => {
        const errors: { field: string; message: string }[] = [];
        if (!b.name || !String(b.name).trim()) errors.push({ field: 'name', message: 'must not be blank' });
        if (b.productCode && db.products.some((p) => p.id !== selfId && p.productCode?.toLowerCase() === String(b.productCode).toLowerCase())) {
          errors.push({ field: 'productCode', message: 'Product code must be unique' });
        }
        if (errors.length) {
          apiError(reply, 400, 'VALIDATION_ERROR', 'Request validation failed', errors);
          return false;
        }
        return true;
      };

      vms.post('/products', async (req, reply) => {
        const b = (req.body ?? {}) as Record<string, unknown>;
        if (!validateProduct(reply, b, null)) return reply;
        const p: Product = {
          id: Math.max(...db.products.map((x) => x.id)) + 1,
          name: '', description: null, productCode: null, productVersion: null, productSku: null, productCategoryId: null, active: true,
          createdBy: req.principal!.email, dateCreated: now(), updatedBy: null, lastUpdated: null,
        };
        applyProduct(p, b);
        db.products.push(p);
        // Every saleable product gets a SUBSCRIPTION product license so it can be assigned.
        db.productLicenses.push({ id: Math.max(...db.productLicenses.map((x) => x.id)) + 1, productId: p.id, licenseType: 'SUBSCRIPTION', active: true });
        return { product: productDto(p), supportingLists: productLists() };
      });

      vms.put('/products/:id', async (req, reply) => {
        const p = findProduct((req.params as { id: string }).id);
        if (!p) return apiError(reply, 404, 'NOT_FOUND', 'No product found');
        const b = (req.body ?? {}) as Record<string, unknown>;
        if (!validateProduct(reply, { name: p.name, ...b }, p.id)) return reply;
        applyProduct(p, b);
        p.updatedBy = req.principal!.email;
        p.lastUpdated = now();
        return { product: productDto(p), supportingLists: productLists() };
      });

      vms.patch('/products/:id', async (req, reply) => {
        const p = findProduct((req.params as { id: string }).id);
        if (!p) return apiError(reply, 404, 'NOT_FOUND', 'No product found');
        const b = (req.body ?? {}) as Record<string, unknown>;
        if ('active' in b) p.active = Boolean(b.active);
        p.updatedBy = req.principal!.email;
        p.lastUpdated = now();
        return productDto(p);
      });

      vms.delete('/products/:id', async (req) => {
        const id = Number((req.params as { id: string }).id);
        const p = findProduct(String(id));
        if (!p) return { deleted: false };
        const plIds = db.productLicenses.filter((pl) => pl.productId === id).map((pl) => pl.id);
        if (db.tenantLicenses.some((tl) => plIds.includes(tl.productLicenseId))) return { deleted: false }; // in use
        db.products.splice(db.products.indexOf(p), 1);
        return { deleted: true };
      });
    },
    { prefix: VMS_PREFIX },
  );
}
