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

export type KeycloakOptions = { accessTtlSeconds: number; refreshTtlSeconds: number; issuer: string };

/** Mock of Keycloak realm `gatekeeper`: realm info, password/refresh grants, logout. */
export function registerKeycloak(app: FastifyInstance, db: Db, keys: KeyMaterial, opts: KeycloakOptions) {
  const refreshTokens = new Map<string, RefreshEntry>();

  const tenantsFor = (email: string, password?: string) => {
    const matches = db.users.filter(
      (u) => u.active && u.email.toLowerCase() === email.toLowerCase() && (password === undefined || u.password === password),
    );
    return matches
      .map((u) => db.tenants.find((t) => t.id === u.tenantId))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => ({ id: t.id, name: t.name }));
  };

  const issue = async (email: string, tenantId: number, sid: string) => {
    const tenants = tenantsFor(email);
    const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.tenantId === tenantId);
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
      .setSubject(String(user?.id ?? 0))
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
      const tenants = tenantsFor(email, form.password ?? '');
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
      const tenants = tenantsFor(entry.email);
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
