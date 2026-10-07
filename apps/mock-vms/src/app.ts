import Fastify, { type FastifyInstance } from 'fastify';
import { createKeys, registerKeycloak, REALM } from './keycloak';
import { createSeed, type Db } from './seed';
import { registerVms } from './vms';

export type MockOptions = {
  /** Artificial latency range in ms, e.g. [150, 350]. [0, 0] disables it (tests). */
  latencyMs?: [number, number];
  /** Public origin of this server, used for Keycloak `iss` and uploaded-file URLs. */
  publicUrl?: string;
  accessTtlSeconds?: number;
  refreshTtlSeconds?: number;
  /** Serve the mock-only `POST tenant/setup/publish/{id}` (V3). Default true. */
  supportPublishDraft?: boolean;
  /** Check Keycloak logins against this real VMS instead of the seed users (see KeycloakOptions.vmsUrl). */
  keycloakVmsUrl?: string;
  logger?: boolean;
  log?: (msg: string) => void;
};

export type MockVms = { app: FastifyInstance; db: Db; setPublicUrl: (url: string) => void };

/**
 * Builds the mock Keycloak (`/realms/gatekeeper`) + VMS (`/vms/internal/v1`) server.
 * Everything is in memory and resets on restart.
 */
export async function buildMockVms(opts: MockOptions = {}): Promise<MockVms> {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 12 * 1024 * 1024 });
  const db: Db = { ...createSeed(), files: new Map() };
  const keys = await createKeys();
  const log = opts.log ?? ((m: string) => console.log(m));

  const [minLatency, maxLatency] = opts.latencyMs ?? [0, 0];
  if (maxLatency > 0) {
    app.addHook('onRequest', async () => {
      const ms = minLatency + Math.random() * (maxLatency - minLatency);
      await new Promise((r) => setTimeout(r, ms));
    });
  }

  // Mutable so tests listening on an ephemeral port can fix up the origin after listen().
  const urls = { publicUrl: opts.publicUrl ?? 'http://localhost:8090' };
  const kcOpts = {
    accessTtlSeconds: opts.accessTtlSeconds ?? 1800,
    refreshTtlSeconds: opts.refreshTtlSeconds ?? 36000,
    vmsUrl: opts.keycloakVmsUrl,
    get issuer() {
      return `${urls.publicUrl}/realms/${REALM}`;
    },
  };
  registerKeycloak(app, db, keys, kcOpts);
  registerVms(app, db, keys, {
    get publicUrl() {
      return urls.publicUrl;
    },
    supportPublishDraft: opts.supportPublishDraft ?? true,
    log,
  });

  return { app, db, setPublicUrl: (u) => (urls.publicUrl = u) };
}
