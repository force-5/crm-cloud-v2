import { randomUUID } from 'node:crypto';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ERROR_CODES } from '@crm/contracts';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import './types';
import { csrfCheck } from './auth/csrf';
import { SecretBox } from './auth/crypto';
import { requireAuth } from './auth/guard';
import { KeycloakClient } from './auth/keycloak';
import { KeyedLimiter } from './auth/limiter';
import { registerSession } from './auth/session';
import type { Config } from './config';
import type { Deps } from './deps';
import { AppError } from './errors';
import { createErrorReporter } from './observability';
import { accountRoutes } from './routes/accounts';
import { authRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { licenseRoutes } from './routes/licenses';
import { lookupRoutes } from './routes/lookups';
import { productRoutes } from './routes/products';
import { profileRoutes } from './routes/profile';
import { registerSpa } from './static';
import { VmsClient } from './vms/client';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function loggerOptions(config: Config): FastifyServerOptions['logger'] {
  return {
    level: config.logLevel,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'req.headers["x-csrf-token"]',
        'res.headers["set-cookie"]',
        '*.password',
        '*.accessToken',
        '*.refreshToken',
      ],
      censor: '[redacted]',
    },
    ...(config.isLocal && process.stdout.isTTY ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } } : {}),
  };
}

function cspDirectives(config: Config) {
  const imgSrc = ["'self'", 'data:', 'blob:', 'https://cdn.force5-dev.com', 'https://*.amazonaws.com', ...config.cspImgOrigins];
  // Locally, uploaded images are served by mock-vms (e.g. http://localhost:8090/vms/files/...).
  if (config.isLocal) imgSrc.push(new URL(config.vmsUrl).origin);
  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"], // no inline scripts
    styleSrc: ["'self'", "'unsafe-inline'"], // Radix/sonner set inline style attributes
    imgSrc,
    fontSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    ...(config.isLocal ? {} : { upgradeInsecureRequests: [] }),
  };
}

export type BuildOptions = { logger?: FastifyServerOptions['logger'] };

export async function buildApp(config: Config, opts: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? loggerOptions(config),
    // A hop count becomes "trust the first n hops from the socket" (proxy-addr semantics); Fastify's
    // types only take booleans/strings/functions.
    trustProxy:
      typeof config.trustProxy === 'number'
        ? (_addr: string, hop: number) => hop < (config.trustProxy as number)
        : config.trustProxy,
    bodyLimit: 1024 * 1024,
    requestIdHeader: false,
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && /^[\w.-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    },
  });
  const reportError = createErrorReporter(config);

  app.decorateRequest('vms', null as never);
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  await app.register(helmet, {
    contentSecurityPolicy: { useDefaults: false, directives: cspDirectives(config) },
    hsts: config.isLocal ? false : { maxAge: 31536000, includeSubDomains: true },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
  await registerSession(app, config);
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () =>
      new AppError(429, ERROR_CODES.RATE_LIMITED, 'Too many attempts. Please wait a minute and try again.'),
  });

  // ---- errors -------------------------------------------------------------------
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) req.log.warn({ code: err.code, msg: err.message }, 'request failed');
      return reply.code(err.statusCode).send(err.toBody());
    }
    const e = err as Error & { statusCode?: number; validation?: unknown; code?: string };
    if (e.validation) {
      return reply.code(400).send(new AppError(400, ERROR_CODES.VALIDATION, 'Invalid request').toBody());
    }
    if (e.statusCode === 413) {
      return reply.code(413).send(new AppError(413, ERROR_CODES.VALIDATION, 'The upload is too large.').toBody());
    }
    if (e.statusCode === 429) {
      return reply.code(429).send(new AppError(429, ERROR_CODES.RATE_LIMITED, 'Too many requests.').toBody());
    }
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.code(e.statusCode).send(new AppError(e.statusCode, ERROR_CODES.VALIDATION, 'Malformed request').toBody());
    }
    req.log.error({ err }, 'unhandled error');
    reportError(err, req);
    return reply.code(500).send(new AppError(500, ERROR_CODES.INTERNAL, 'Something went wrong. Please try again.').toBody());
  });

  // ---- dependencies ------------------------------------------------------------------
  const keycloak = new KeycloakClient(
    { realmUrl: config.keycloak.realmUrl, clientId: config.keycloak.clientId, timeoutMs: 10_000 },
    app.log,
  );
  const vmsClient = new VmsClient({ baseUrl: config.vmsUrl, appId: config.appId, timeoutMs: config.vmsTimeoutMs }, app.log);
  const deps: Deps = {
    config,
    keycloak,
    vmsClient,
    secretBox: new SecretBox(config.sessionSecret),
    requireAuth: requireAuth({ config, keycloak, vmsClient }),
    loginLimiter: new KeyedLimiter(config.rateLimit.loginPerEmail, 15 * 60_000),
    recoveryLimiter: new KeyedLimiter(config.rateLimit.loginPerEmail, 15 * 60_000),
  };

  // ---- /api ---------------------------------------------------------------------------
  await app.register(
    async (api) => {
      api.addHook('preHandler', csrfCheck);

      // Structured audit line for every mutation (plan §9).
      api.addHook('onResponse', async (req, reply) => {
        if (SAFE_METHODS.has(req.method)) return;
        const auth = req.session?.auth;
        const params = (req.params ?? {}) as Record<string, string>;
        req.log.info(
          {
            audit: {
              action: req.routeOptions.config?.audit ?? `${req.method} ${req.routeOptions.url ?? req.url}`,
              user: req.auditUser ?? auth?.user.email ?? null,
              userId: auth?.user.id ?? null,
              tenant: req.auditTenant ?? auth?.tenantId ?? null,
              targetId: req.auditTarget ?? params.id ?? null,
              result: reply.statusCode < 400 ? 'success' : 'failure',
              status: reply.statusCode,
              requestId: req.id,
            },
          },
          'audit',
        );
      });

      await api.register(healthRoutes, deps);
      await api.register(authRoutes, deps);
      await api.register(async (secured) => {
        secured.addHook('preHandler', deps.requireAuth);
        await secured.register(accountRoutes, deps);
        await secured.register(licenseRoutes, deps);
        await secured.register(productRoutes, deps);
        await secured.register(profileRoutes, deps);
        await secured.register(lookupRoutes, deps);
      });
    },
    { prefix: config.apiPrefix },
  );

  const spa = await registerSpa(app, config);

  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0]!;
    if (spa && (req.method === 'GET' || req.method === 'HEAD') && path.startsWith(`${config.basePath}/`) && !path.startsWith(`${config.apiPrefix}/`)) {
      return reply.header('Cache-Control', 'no-cache').type('text/html').sendFile('index.html');
    }
    return reply.code(404).send(new AppError(404, ERROR_CODES.NOT_FOUND, 'Not found').toBody());
  });

  return app;
}
