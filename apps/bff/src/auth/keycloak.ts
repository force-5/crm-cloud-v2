import type { FastifyBaseLogger } from 'fastify';
import { ERROR_CODES, type TenantChoice } from '@crm/contracts';
import { importSPKI, jwtVerify, type CryptoKey } from 'jose';
import { z } from 'zod';
import { AppError, serviceUnavailable, unauthenticated } from '../errors';

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
  refreshExpiresAt?: number;
};

const tokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  refresh_expires_in: z.number().optional(),
});

const tenantsClaim = z.array(z.object({ id: z.coerce.number(), name: z.string().nullish() }));

export type KeycloakConfig = { realmUrl: string; clientId: string; timeoutMs: number };

/**
 * Server-side Keycloak client for realm `gatekeeper` / client `gk-admin` — the same calls the
 * Grails AuthenticationService makes. Tokens never leave the BFF.
 */
export class KeycloakClient {
  private publicKey: CryptoKey | undefined;

  constructor(
    private readonly cfg: KeycloakConfig,
    private readonly log: FastifyBaseLogger,
  ) {}

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(`${this.cfg.realmUrl}${path}`, {
        ...init,
        headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
    } catch (err) {
      this.log.error({ err, path }, 'Keycloak unreachable');
      throw serviceUnavailable();
    }
  }

  /** `GET {kc}/realms/gatekeeper` — liveness check + realm public key. */
  async realmInfo(): Promise<{ public_key: string }> {
    const res = await this.fetch('');
    if (!res.ok) {
      this.log.error({ status: res.status }, 'Keycloak realm endpoint failed');
      throw serviceUnavailable();
    }
    const body = z.object({ public_key: z.string() }).safeParse(await res.json().catch(() => null));
    if (!body.success) throw serviceUnavailable();
    return body.data;
  }

  async isAlive(): Promise<boolean> {
    try {
      await this.realmInfo();
      return true;
    } catch {
      return false;
    }
  }

  private async key(refresh = false): Promise<CryptoKey> {
    if (!this.publicKey || refresh) {
      const { public_key } = await this.realmInfo();
      const pem = `-----BEGIN PUBLIC KEY-----\n${public_key.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`;
      this.publicKey = await importSPKI(pem, 'RS256');
    }
    return this.publicKey;
  }

  private async grant(form: Record<string, string>): Promise<TokenSet | 'invalid'> {
    const res = await this.fetch('/protocol/openid-connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.cfg.clientId, ...form }).toString(),
    });
    if (res.status === 400 || res.status === 401) return 'invalid';
    if (!res.ok) {
      this.log.error({ status: res.status }, 'Keycloak token endpoint failed');
      throw serviceUnavailable();
    }
    const parsed = tokenResponse.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw serviceUnavailable();
    const now = Date.now();
    return {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token,
      expiresAt: now + parsed.data.expires_in * 1000,
      refreshExpiresAt: parsed.data.refresh_expires_in ? now + parsed.data.refresh_expires_in * 1000 : undefined,
    };
  }

  /** Password grant. Bad credentials → 401 INVALID_CREDENTIALS. */
  async passwordGrant(email: string, password: string, tenantId: number): Promise<TokenSet> {
    const r = await this.grant({ grant_type: 'password', username: email, password, tenant_id: String(tenantId) });
    if (r === 'invalid') throw new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password.');
    return r;
  }

  /** Refresh grant (with tenant_id, as Grails does). Failure → 401 (session over). */
  async refreshGrant(refreshToken: string, tenantId: number): Promise<TokenSet> {
    const r = await this.grant({ grant_type: 'refresh_token', refresh_token: refreshToken, tenant_id: String(tenantId) });
    if (r === 'invalid') throw unauthenticated('Your session has expired. Please sign in again.');
    return r;
  }

  /** Revoke the refresh token / end the Keycloak session. Best effort. */
  async logout(refreshToken: string): Promise<void> {
    try {
      await this.fetch('/protocol/openid-connect/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: this.cfg.clientId, refresh_token: refreshToken }).toString(),
      });
    } catch (err) {
      this.log.warn({ err }, 'Keycloak logout failed');
    }
  }

  /** Verify the access token against the realm public key and read the `tenants` claim. */
  async tenantsFromToken(accessToken: string): Promise<TenantChoice[]> {
    let payload: Record<string, unknown>;
    try {
      payload = (await jwtVerify(accessToken, await this.key(), { algorithms: ['RS256'] })).payload;
    } catch {
      // The realm key may have rotated: refetch once.
      try {
        payload = (await jwtVerify(accessToken, await this.key(true), { algorithms: ['RS256'] })).payload;
      } catch (err) {
        if (err instanceof AppError) throw err;
        this.log.warn({ err }, 'Access token failed verification');
        throw new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Sign-in could not be verified.');
      }
    }
    const tenants = tenantsClaim.safeParse(payload.tenants ?? []);
    if (!tenants.success) return [];
    return tenants.data.map((t) => ({ id: t.id, name: t.name ?? `Account ${t.id}` }));
  }
}
