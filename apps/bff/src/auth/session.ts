import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import type { CurrentUser, MfaType, TenantChoice } from '@crm/contracts';
import type { FastifyInstance, Session } from 'fastify';
import { RedisStore } from 'connect-redis';
import { Redis } from 'ioredis';
import type { Config } from '../config';
import type { TokenSet } from './keycloak';
import { MemorySharedState, RedisSharedState, type SharedState } from './shared-state';

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
      /** AES-GCM encrypted password; one-shot (enforced by a shared counter on `nonce`), max 2 minutes. */
      password?: string;
      /** Keys this pending login's shared counters (see SharedState). */
      nonce: string;
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
      /** Keys the shared MFA attempt counter (a session field could be raced by parallel requests). */
      nonce: string;
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
/** A session with no sign-in (or sign-in in progress) yet: created by GET /auth/csrf, so anyone can mint them. */
export const isAnonymous = (s: Partial<Session>) => !s.auth && !s.pending;
/** Anonymous sessions only need to outlive the login form (security review M3). */
export const ANONYMOUS_SESSION_TTL_MS = 5 * 60_000;

export class TtlMemoryStore {
  private readonly map = new Map<string, { json: string; exp: number; anon: boolean }>();
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly ttlMs: number,
    private readonly maxSessions = 50_000,
  ) {
    this.timer = setInterval(() => this.sweep(), 60_000);
    this.timer.unref();
  }

  private sweep() {
    const now = Date.now();
    for (const [k, v] of this.map) if (v.exp <= now) this.map.delete(k);
  }

  set(id: string, session: Session, cb: Cb) {
    const anon = isAnonymous(session);
    const exp = anon
      ? Date.now() + ANONYMOUS_SESSION_TTL_MS
      : session.cookie?.expires
        ? new Date(session.cookie.expires).getTime()
        : Date.now() + this.ttlMs;
    if (!this.map.has(id) && this.map.size >= this.maxSessions) this.makeRoom();
    this.map.set(id, { json: JSON.stringify(session), exp, anon });
    cb();
  }

  /** Under a flood of anonymous sessions, evict expired and then anonymous ones — never signed-in users. */
  private makeRoom() {
    this.sweep();
    for (const [k, v] of this.map) {
      if (this.map.size < this.maxSessions) return;
      if (v.anon) this.map.delete(k);
    }
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

type CbStore = {
  get(id: string, cb: Cb): unknown;
  set(id: string, session: Session, cb: Cb): unknown;
  destroy(id: string, cb: Cb): unknown;
};

/**
 * Wraps the real store so a destroyed session can never come back (security review M1). Every request
 * writes its session copy back when it ends, so a request in flight during logout would otherwise
 * re-create the session it started with. Destroy tombstones the id first; reads of a tombstoned id
 * return nothing; writes are skipped, and undone if a destroy raced in between.
 */
export class RevocationGuardedStore {
  constructor(
    private readonly inner: CbStore,
    private readonly shared: SharedState,
    private readonly tombstoneMs: number,
  ) {}

  get(id: string, cb: Cb) {
    this.shared.isRevoked(id).then(
      (revoked) => (revoked ? cb(undefined, null) : void this.inner.get(id, cb)),
      (err) => cb(err),
    );
  }

  set(id: string, session: Session, cb: Cb) {
    this.shared.isRevoked(id).then(
      (revoked) => {
        if (revoked) return cb();
        this.inner.set(id, session, (err) => {
          if (err) return cb(err);
          // Close the gap between the check above and the write: if a destroy landed meanwhile, undo.
          this.shared.isRevoked(id).then(
            (late) => (late ? void this.inner.destroy(id, () => cb()) : cb()),
            () => cb(),
          );
        });
      },
      (err) => cb(err),
    );
  }

  destroy(id: string, cb: Cb) {
    this.shared.revoke(id, this.tombstoneMs).then(
      () => void this.inner.destroy(id, cb),
      (err) => cb(err),
    );
  }
}

/** Registers cookie + session handling and returns the shared security state the routes use. */
export async function registerSession(app: FastifyInstance, config: Config): Promise<SharedState> {
  const idleMs = config.sessionIdleMinutes * 60_000;

  let inner: CbStore;
  let shared: SharedState;
  if (config.redisUrl) {
    const client = new Redis(config.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 });
    client.on('error', (err) => app.log.error({ err }, 'Redis error'));
    app.addHook('onClose', async () => {
      await client.quit().catch(() => undefined);
    });
    inner = new RedisStore({
      client,
      prefix: 'crm:sess:',
      ttl: (sess) =>
        isAnonymous(sess as unknown as Session) ? ANONYMOUS_SESSION_TTL_MS / 1000 : config.sessionIdleMinutes * 60,
    }) as unknown as CbStore;
    shared = new RedisSharedState(client);
    app.log.info('Session store: Redis');
  } else {
    inner = new TtlMemoryStore(idleMs);
    shared = new MemorySharedState();
    app.log.info('Session store: in-memory (single instance only)');
  }
  // Tombstones outlive any request that could still be in flight (and the session itself).
  const store = new RevocationGuardedStore(inner, shared, idleMs);

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
  return shared;
}
