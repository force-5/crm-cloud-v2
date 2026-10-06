import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import type { CurrentUser, MfaType, TenantChoice } from '@crm/contracts';
import type { FastifyInstance, Session } from 'fastify';
import { RedisStore } from 'connect-redis';
import { Redis } from 'ioredis';
import type { Config } from '../config';
import type { TokenSet } from './keycloak';

/** Fully signed-in state. Tokens live only here (server side). */
export type AuthState = TokenSet & {
  tenantId: number;
  user: CurrentUser;
  loginAt: number;
};

/** Login in progress (tenant picker or MFA). The session is NOT authenticated while this is set. */
export type PendingLogin =
  | {
      stage: 'select-account';
      email: string;
      /** AES-GCM encrypted password; one-shot, max 2 minutes. */
      password?: string;
      passwordExpiresAt: number;
      accounts: TenantChoice[];
    }
  | {
      stage: 'mfa';
      email: string;
      tokens: TokenSet;
      tenantId: number;
      user: CurrentUser;
      channel: MfaType;
      /** Destination VMS verifies against (E.164 mobile for SMS). */
      to: string;
      /** VMS user token used by `auth/sendMfaCode`. */
      userToken: string;
      attempts: number;
      expiresAt: number;
    };

declare module 'fastify' {
  interface Session {
    csrfToken?: string;
    auth?: AuthState;
    pending?: PendingLogin;
    lastSeen?: number;
  }
}

export const SESSION_COOKIE = 'crm.sid';

type Cb = (err?: unknown, result?: Session | null) => void;

/**
 * In-memory store with TTL sweeping (the bundled MemoryStore never evicts). Values are stored as
 * JSON so local dev behaves like Redis (no live object aliasing, no non-serializable data).
 */
export class TtlMemoryStore {
  private readonly map = new Map<string, { json: string; exp: number }>();
  private readonly timer: NodeJS.Timeout;

  constructor(private readonly ttlMs: number) {
    this.timer = setInterval(() => this.sweep(), 60_000);
    this.timer.unref();
  }

  private sweep() {
    const now = Date.now();
    for (const [k, v] of this.map) if (v.exp <= now) this.map.delete(k);
  }

  set(id: string, session: Session, cb: Cb) {
    const exp = session.cookie?.expires ? new Date(session.cookie.expires).getTime() : Date.now() + this.ttlMs;
    this.map.set(id, { json: JSON.stringify(session), exp });
    cb();
  }

  get(id: string, cb: Cb) {
    const v = this.map.get(id);
    if (!v || v.exp <= Date.now()) {
      this.map.delete(id);
      return cb(undefined, null);
    }
    cb(undefined, JSON.parse(v.json) as Session);
  }

  destroy(id: string, cb: Cb) {
    this.map.delete(id);
    cb();
  }

  get size() {
    return this.map.size;
  }
}

export async function registerSession(app: FastifyInstance, config: Config) {
  const idleMs = config.sessionIdleMinutes * 60_000;

  let store: unknown;
  if (config.redisUrl) {
    const client = new Redis(config.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 });
    client.on('error', (err) => app.log.error({ err }, 'Redis error'));
    app.addHook('onClose', async () => {
      await client.quit().catch(() => undefined);
    });
    store = new RedisStore({ client, prefix: 'crm:sess:', ttl: config.sessionIdleMinutes * 60 });
    app.log.info('Session store: Redis');
  } else {
    store = new TtlMemoryStore(idleMs);
    app.log.info('Session store: in-memory (single instance only)');
  }

  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    secret: config.sessionSecret,
    cookieName: SESSION_COOKIE,
    saveUninitialized: false,
    rolling: true, // idle timeout: every request pushes expiry out by SESSION_IDLE_MINUTES
    store: store as never,
    cookie: {
      path: config.basePath,
      httpOnly: true,
      sameSite: 'strict',
      secure: !config.isLocal,
      maxAge: idleMs,
    },
  });
}
