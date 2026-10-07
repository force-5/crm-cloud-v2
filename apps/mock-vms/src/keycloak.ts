import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { SignJWT, exportSPKI, generateKeyPair, jwtVerify, type CryptoKey } from 'jose';
import type { Db } from './seed';

export const REALM = 'gatekeeper';
export const CLIENT_ID = 'gk-admin';

export type KeyMaterial = { privateKey: CryptoKey; publicKey: CryptoKey; publicKeyB64: string };

export async function createKeys(): Promise<KeyMaterial> {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const pem = await exportSPKI(publicKey);
  // Keycloak's realm endpoint returns the bare base64 SPKI (no PEM armour).
  const publicKeyB64 = pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '');
  return { privateKey, publicKey, publicKeyB64 };
}

export type AccessClaims = {
  sub: string;
  email: string;
  tenant_id: number;
  tenants: { id: number; name: string }[];
  sid: string;
};

export async function verifyAccessToken(keys: KeyMaterial, token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, keys.publicKey, { algorithms: ['RS256'] });
  return payload as unknown as AccessClaims;
}

type RefreshEntry = { email: string; tenantId: number; sid: string; expiresAt: number };

export type KeycloakOptions = {
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  issuer: string;
  /**
   * When set, credentials are checked against a real VMS (`POST {vmsUrl}authenticate`) instead of the
   * seed users — the same check the real Keycloak "F5 Gatekeeper" SPI makes against the VMS database.
   * Lets the BFF run against a local vmsServer, whose `local` profile does not verify token signatures.
   */
  vmsUrl?: string;
};

type TenantRef = { id: number; name: string };

/** Where the mock Keycloak looks users up: the in-memory seed, or a real VMS. */
type Directory = {
  /** Tenants the user belongs to; with a password, only when the credentials are valid. */
  tenantsFor(email: string, password?: string, requestedTenant?: number): Promise<TenantRef[]>;
  userId(email: string, tenantId: number): string;
};

function seedDirectory(db: Db): Directory {
  return {
    async tenantsFor(email, password) {
      return db.users
        .filter(
          (u) =>
            u.active && u.email.toLowerCase() === email.toLowerCase() && (password === undefined || u.password === password),
        )
        .map((u) => db.tenants.find((t) => t.id === u.tenantId))
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map((t) => ({ id: t.id, name: t.name }));
    },
    userId(email, tenantId) {
      const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.tenantId === tenantId);
      return String(user?.id ?? 0);
    },
  };
}

function vmsDirectory(vmsUrl: string): Directory {
  // VMS can only verify a password for one tenant at a time, so the `tenants` claim lists the tenants
  // the user has successfully signed in to (multi-tenant pickers aren't exercised in this mode).
  const known = new Map<string, { tenants: TenantRef[]; ids: Map<number, string> }>();
  return {
    async tenantsFor(email, password, requestedTenant) {
      const key = email.toLowerCase();
      if (password === undefined) return known.get(key)?.tenants ?? [];
      const res = await fetch(new URL('authenticate', vmsUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, password, tenantId: requestedTenant ?? 1 }),
      });
      const text = res.ok ? await res.text() : '';
      if (!text) return []; // VMS answers bad credentials with 200 + empty body (V11)
      const user = (JSON.parse(text) as { user?: { id?: number; tenant?: { id?: number; name?: string } } }).user;
      if (!user?.tenant?.id) return [];
      const entry = known.get(key) ?? { tenants: [] as TenantRef[], ids: new Map<number, string>() };
      if (!entry.tenants.some((t) => t.id === user.tenant!.id)) {
        entry.tenants.push({ id: user.tenant.id, name: user.tenant.name ?? `Tenant ${user.tenant.id}` });
      }
      entry.ids.set(user.tenant.id, String(user.id ?? 0));
      known.set(key, entry);
      return entry.tenants;
    },
    userId(email, tenantId) {
      return known.get(email.toLowerCase())?.ids.get(tenantId) ?? '0';
    },
  };
}

/** Mock of Keycloak realm `gatekeeper`: realm info, password/refresh grants, logout. */
export function registerKeycloak(app: FastifyInstance, db: Db, keys: KeyMaterial, opts: KeycloakOptions) {
  const refreshTokens = new Map<string, RefreshEntry>();

  const directory = opts.vmsUrl ? vmsDirectory(opts.vmsUrl) : seedDirectory(db);

  const issue = async (email: string, tenantId: number, sid: string) => {
    const tenants = await directory.tenantsFor(email);
    const now = Math.floor(Date.now() / 1000);
    const access_token = await new SignJWT({
      email,
      preferred_username: email,
      tenant_id: tenantId,
      tenants,
      sid,
      azp: CLIENT_ID,
      typ: 'Bearer',
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'mock-key' })
      .setSubject(directory.userId(email, tenantId))
      .setIssuer(opts.issuer)
      .setIssuedAt(now)
      .setExpirationTime(now + opts.accessTtlSeconds)
      .setJti(randomUUID())
      .sign(keys.privateKey);
    const refresh_token = `mock-rt.${randomUUID()}`;
    refreshTokens.set(refresh_token, { email, tenantId, sid, expiresAt: Date.now() + opts.refreshTtlSeconds * 1000 });
    return {
      access_token,
      expires_in: opts.accessTtlSeconds,
      refresh_expires_in: opts.refreshTtlSeconds,
      refresh_token,
      token_type: 'Bearer',
      'not-before-policy': 0,
      session_state: sid,
      scope: 'email profile',
    };
  };

  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  const base = `/realms/${REALM}`;

  app.get(base, async () => ({
    realm: REALM,
    public_key: keys.publicKeyB64,
    'token-service': `${opts.issuer}/protocol/openid-connect`,
    'account-service': `${opts.issuer}/account`,
    'tokens-not-before': 0,
  }));

  app.post(`${base}/protocol/openid-connect/token`, async (req, reply) => {
    const form = (req.body ?? {}) as Record<string, string>;
    if (form.client_id !== CLIENT_ID) {
      return reply.code(401).send({ error: 'invalid_client', error_description: 'Invalid client or Invalid client credentials' });
    }
    const requestedTenant = form.tenant_id ? Number(form.tenant_id) : undefined;

    if (form.grant_type === 'password') {
      const email = (form.username ?? '').trim();
      const tenants = email ? await directory.tenantsFor(email, form.password ?? '', requestedTenant) : [];
      if (!email || tenants.length === 0) {
        return reply.code(401).send({ error: 'invalid_grant', error_description: 'Invalid user credentials' });
      }
      // The gatekeeper tenant mapper scopes the token to tenant_id when the user belongs to it,
      // otherwise to the user's first tenant. The `tenants` claim always lists all of them.
      const tenantId = tenants.some((t) => t.id === requestedTenant) ? requestedTenant! : tenants[0]!.id;
      return issue(email, tenantId, randomUUID());
    }

    if (form.grant_type === 'refresh_token') {
      const entry = refreshTokens.get(form.refresh_token ?? '');
      if (!entry || entry.expiresAt < Date.now()) {
        return reply.code(400).send({ error: 'invalid_grant', error_description: 'Token is not active' });
      }
      const tenants = await directory.tenantsFor(entry.email);
      const tenantId = tenants.some((t) => t.id === requestedTenant) ? requestedTenant! : entry.tenantId;
      return issue(entry.email, tenantId, entry.sid);
    }

    return reply.code(400).send({ error: 'unsupported_grant_type', error_description: 'Unsupported grant_type' });
  });

  app.post(`${base}/protocol/openid-connect/logout`, async (req, reply) => {
    const form = (req.body ?? {}) as Record<string, string>;
    const entry = refreshTokens.get(form.refresh_token ?? '');
    if (entry) {
      // Ends the whole Keycloak session: every refresh token in it becomes invalid.
      for (const [k, v] of refreshTokens) if (v.sid === entry.sid) refreshTokens.delete(k);
    }
    return reply.code(204).send();
  });

  return { refreshTokens };
}
