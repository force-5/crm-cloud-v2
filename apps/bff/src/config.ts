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
    PORT: z.coerce.number().int().positive().default(8082),
    HOST: z.string().default('0.0.0.0'),
    BASE_PATH: z
      .string()
      .default('/crm')
      .transform((s) => `/${s.replace(/^\/+|\/+$/g, '')}`),
    VMS_URL: z.string().url().default('http://localhost:8090/vms/internal/v1/').transform(withSlash),
    KEYCLOAK_URL: z.string().url().default('http://localhost:8090/realms/').transform(withSlash),
    KEYCLOAK_REALM: z.string().default('gatekeeper'),
    KEYCLOAK_CLIENT_ID: z.string().default('gk-admin'),
    X_APP_ID: z.string().default('CRM_001'),
    SESSION_SECRET: z.string().optional(),
    SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(60),
    REDIS_URL: z.string().optional(),
    WEB_DIST: z.string().optional(),
    SENTRY_DSN: z.string().optional(),
    CRM_ALLOWED_TENANT_IDS: csv('1').pipe(z.array(z.string().regex(/^\d+$/, 'must be numeric ids').transform(Number))),
    CRM_REQUIRED_PERMISSION: z.string().default('MANAGE_ACCOUNT'),
    CDN_DEFAULT_LOGIN_BG: z.string().default('https://cdn.force5-dev.com/f5/assets/f5-login-bg.png'),
    CDN_DEFAULT_LOGO: z.string().default('https://cdn.force5-dev.com/f5/assets/f5-logo-dark.png'),
    /** Extra img-src origins for the CSP (comma separated). */
    CSP_IMG_ORIGINS: csv(''),
    /** Trust X-Forwarded-* (behind ALB/CloudFront). Defaults to true outside local. */
    TRUST_PROXY: z.enum(['true', 'false']).optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    VMS_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
    LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
    LOGIN_RATE_LIMIT_PER_EMAIL: z.coerce.number().int().positive().default(10),
  })
  .superRefine((env, ctx) => {
    if (!env.SESSION_SECRET && env.APP_ENV !== 'local') {
      ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'SESSION_SECRET is required unless APP_ENV=local' });
    }
    if (env.SESSION_SECRET && env.SESSION_SECRET.length < 32) {
      ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'SESSION_SECRET must be at least 32 characters' });
    }
  });

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid BFF configuration:\n${msg}`);
  }
  const e = parsed.data;
  const isLocal = e.APP_ENV === 'local';
  return {
    env: e.APP_ENV,
    isLocal,
    port: e.PORT,
    host: e.HOST,
    basePath: e.BASE_PATH,
    apiPrefix: `${e.BASE_PATH}/api`,
    vmsUrl: e.VMS_URL,
    keycloak: {
      url: e.KEYCLOAK_URL,
      realm: e.KEYCLOAK_REALM,
      clientId: e.KEYCLOAK_CLIENT_ID,
      realmUrl: `${e.KEYCLOAK_URL}${e.KEYCLOAK_REALM}`,
    },
    appId: e.X_APP_ID,
    sessionSecret: e.SESSION_SECRET ?? DEV_SESSION_SECRET,
    sessionIdleMinutes: e.SESSION_IDLE_MINUTES,
    redisUrl: e.REDIS_URL || undefined,
    webDist: e.WEB_DIST || undefined,
    sentryDsn: e.SENTRY_DSN || undefined,
    crm: { allowedTenantIds: e.CRM_ALLOWED_TENANT_IDS, requiredPermission: e.CRM_REQUIRED_PERMISSION },
    cdn: { loginBg: e.CDN_DEFAULT_LOGIN_BG, logo: e.CDN_DEFAULT_LOGO },
    cspImgOrigins: e.CSP_IMG_ORIGINS,
    trustProxy: e.TRUST_PROXY ? e.TRUST_PROXY === 'true' : !isLocal,
    logLevel: e.LOG_LEVEL,
    vmsTimeoutMs: e.VMS_TIMEOUT_MS,
    rateLimit: { loginPerMinute: e.LOGIN_RATE_LIMIT_PER_MINUTE, loginPerEmail: e.LOGIN_RATE_LIMIT_PER_EMAIL },
  };
}
