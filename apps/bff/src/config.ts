import { z } from 'zod';

const DEV_SESSION_SECRET = 'local-dev-only-session-secret-change-me-0123456789';

const csv = (def: string) =>
  z
    .string()
    .default(def)
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    );

const withSlash = (s: string) => (s.endsWith('/') ? s : `${s}/`);

const envSchema = z
  .object({
    APP_ENV: z.enum(['local', 'dev', 'staging', 'production']).default('local'),
    NODE_ENV: z.string().optional(),
    PORT: z.coerce.number().int().positive().default(8082),
    HOST: z.string().default('0.0.0.0'),
    BASE_PATH: z
      .string()
      .default('/crm')
      .transform((s) => `/${s.replace(/^\/+|\/+$/g, '')}`),
    // Defaults point at apps/mock-vms and apply ONLY when APP_ENV=local; elsewhere they are required
    // (fail fast, like admin-cloud-v2 — never silently talk to a localhost mock in a deployed env).
    VMS_URL: z.string().url().transform(withSlash).optional(),
    KEYCLOAK_URL: z.string().url().transform(withSlash).optional(),
    KEYCLOAK_REALM: z.string().default('gatekeeper'),
    KEYCLOAK_CLIENT_ID: z.string().default('gk-admin'),
    X_APP_ID: z.string().default('CRM_001'),
    SESSION_SECRET: z.string().optional(),
    SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(60),
    /** Absolute session lifetime, however active the user is (review L7). */
    SESSION_MAX_HOURS: z.coerce.number().positive().default(12),
    REDIS_URL: z.string().optional(),
    WEB_DIST: z.string().optional(),
    SENTRY_DSN: z.string().optional(),
    /** DSN the web app is built with (VITE_SENTRY_DSN); the Sentry tunnel forwards to it. */
    SENTRY_WEB_DSN: z.string().optional(),
    CRM_ALLOWED_TENANT_IDS: csv('1').pipe(z.array(z.string().regex(/^\d+$/, 'must be numeric ids').transform(Number))),
    // Decision D1. VMS has no CRM permission codes today, so access is granted by role.
    CRM_ALLOWED_ROLES: csv('CRM_ADMIN,ROLE_ADMIN'),
    // Optional: also admit users holding this VMS permission (once VMS adds one, e.g. MANAGE_ACCOUNT).
    CRM_REQUIRED_PERMISSION: z.string().optional(),
    CDN_DEFAULT_LOGIN_BG: z.string().default('https://cdn.force5-dev.com/f5/assets/f5-login-bg.png'),
    CDN_DEFAULT_LOGO: z.string().default('https://cdn.force5-dev.com/f5/assets/f5-logo-dark.png'),
    /** Extra img-src origins for the CSP (comma separated). */
    CSP_IMG_ORIGINS: csv(''),
    /**
     * X-Forwarded-For trust. A hop count is the safe choice behind known proxies: CloudFront → ALB →
     * nginx is 3, so the client IP (used for login rate limiting) can't be spoofed with a forged header.
     * 'true' trusts every hop (spoofable); 'false' trusts none. Default: 'false' locally, else 3.
     */
    TRUST_PROXY: z.union([z.enum(['true', 'false']), z.string().regex(/^\d+$/, 'must be true, false or a hop count')]).optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    VMS_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
    LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
    LOGIN_RATE_LIMIT_PER_EMAIL: z.coerce.number().int().positive().default(10),
  })
  .superRefine((env, ctx) => {
    if (!env.SESSION_SECRET && env.APP_ENV !== 'local') {
      ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'SESSION_SECRET is required unless APP_ENV=local' });
    }
    // Fail closed (review L4): a production runtime that forgot APP_ENV would otherwise run as `local` —
    // repo session secret, insecure cookie, no HSTS, no proxy trust.
    if (env.APP_ENV === 'local' && env.NODE_ENV === 'production') {
      ctx.addIssue({ code: 'custom', path: ['APP_ENV'], message: 'APP_ENV must be set (not local) when NODE_ENV=production' });
    }
    for (const key of ['VMS_URL', 'KEYCLOAK_URL'] as const) {
      if (!env[key] && env.APP_ENV !== 'local') {
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required unless APP_ENV=local` });
      }
    }
    if (env.SESSION_SECRET && env.SESSION_SECRET.length < 32) {
      ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'SESSION_SECRET must be at least 32 characters' });
    }
  });

export type Config = ReturnType<typeof loadConfig>;

function parseTrustProxy(v: string | undefined, isLocal: boolean): boolean | number {
  if (v === undefined) return isLocal ? false : 3;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return Number(v);
}

export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid BFF configuration:\n${msg}`);
  }
  const e = parsed.data;
  const isLocal = e.APP_ENV === 'local';
  const vmsUrl = e.VMS_URL ?? 'http://localhost:8090/vms/internal/v1/';
  const keycloakUrl = e.KEYCLOAK_URL ?? 'http://localhost:8090/realms/';
  return {
    env: e.APP_ENV,
    isLocal,
    port: e.PORT,
    host: e.HOST,
    basePath: e.BASE_PATH,
    apiPrefix: `${e.BASE_PATH}/api`,
    vmsUrl,
    keycloak: {
      url: keycloakUrl,
      realm: e.KEYCLOAK_REALM,
      clientId: e.KEYCLOAK_CLIENT_ID,
      realmUrl: `${keycloakUrl}${e.KEYCLOAK_REALM}`,
    },
    appId: e.X_APP_ID,
    sessionSecret: e.SESSION_SECRET ?? DEV_SESSION_SECRET,
    sessionIdleMinutes: e.SESSION_IDLE_MINUTES,
    sessionMaxMs: e.SESSION_MAX_HOURS * 3_600_000,
    redisUrl: e.REDIS_URL || undefined,
    webDist: e.WEB_DIST || undefined,
    sentryDsn: e.SENTRY_DSN || undefined,
    sentryWebDsn: e.SENTRY_WEB_DSN || undefined,
    crm: {
      allowedTenantIds: e.CRM_ALLOWED_TENANT_IDS,
      allowedRoles: e.CRM_ALLOWED_ROLES,
      requiredPermission: e.CRM_REQUIRED_PERMISSION || undefined,
    },
    cdn: { loginBg: e.CDN_DEFAULT_LOGIN_BG, logo: e.CDN_DEFAULT_LOGO },
    cspImgOrigins: e.CSP_IMG_ORIGINS,
    trustProxy: parseTrustProxy(e.TRUST_PROXY, isLocal),
    logLevel: e.LOG_LEVEL,
    vmsTimeoutMs: e.VMS_TIMEOUT_MS,
    rateLimit: { loginPerMinute: e.LOGIN_RATE_LIMIT_PER_MINUTE, loginPerEmail: e.LOGIN_RATE_LIMIT_PER_EMAIL },
  };
}
