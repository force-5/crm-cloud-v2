import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { buildMockVms, type MockOptions, type MockVms } from '../../mock-vms/src/app';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

export const PASSWORD = 'Force5!demo';

export type Recorded = { method: string; url: string; body: unknown; headers: Record<string, unknown> };

export type Stack = {
  mock: MockVms;
  mockUrl: string;
  app: FastifyInstance;
  /** Every request the BFF made to mock-vms (Keycloak + VMS). */
  calls: Recorded[];
  /** Log lines written by the BFF (JSON objects). */
  logs: Record<string, unknown>[];
  client: () => TestClient;
  close: () => Promise<void>;
};

/** mock-vms on an ephemeral port + the BFF (driven with inject). */
export async function startStack(opts: { mock?: MockOptions; env?: Record<string, string> } = {}): Promise<Stack> {
  const mock = await buildMockVms({ latencyMs: [0, 0], log: () => undefined, ...opts.mock });
  const calls: Recorded[] = [];
  mock.app.addHook('preHandler', async (req) => {
    calls.push({ method: req.method, url: req.url, body: req.body, headers: { ...req.headers } });
  });
  await mock.app.listen({ port: 0, host: '127.0.0.1' });
  const port = (mock.app.server.address() as AddressInfo).port;
  const mockUrl = `http://127.0.0.1:${port}`;
  mock.setPublicUrl(mockUrl);

  const logs: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      for (const line of String(chunk).split('\n').filter(Boolean)) {
        try {
          logs.push(JSON.parse(line));
        } catch {
          /* ignore */
        }
      }
      cb();
    },
  });

  const config = loadConfig({
    APP_ENV: 'local',
    VMS_URL: `${mockUrl}/vms/internal/v1/`,
    KEYCLOAK_URL: `${mockUrl}/realms/`,
    // Tests log in many times from 127.0.0.1; the rate-limit test sets its own low limit.
    LOGIN_RATE_LIMIT_PER_MINUTE: '1000',
    LOGIN_RATE_LIMIT_PER_EMAIL: '1000',
    ...opts.env,
  });
  const app = await buildApp(config, { logger: { level: 'info', stream } });
  await app.ready();

  return {
    mock,
    mockUrl,
    app,
    calls,
    logs,
    client: () => new TestClient(app),
    close: async () => {
      await app.close();
      await mock.app.close();
    },
  };
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A browser-ish client: keeps the session cookie and the CSRF token. */
export class TestClient {
  cookies = new Map<string, string>();
  csrf: string | undefined;

  constructor(private readonly app: FastifyInstance) {}

  async request(method: Method, path: string, body?: unknown, opts: { csrf?: string | null } = {}) {
    const headers: Record<string, string> = { 'user-agent': 'vitest' };
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const csrf = opts.csrf === undefined ? this.csrf : opts.csrf;
    if (method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
    const res = await this.app.inject({
      method,
      url: `/crm/api${path}`,
      headers,
      ...(body !== undefined ? { payload: body as object } : {}),
    });
    for (const c of res.cookies as { name: string; value: string; maxAge?: number; expires?: Date }[]) {
      const expired = c.maxAge === 0 || (c.expires && c.expires.getTime() < Date.now()) || c.value === '';
      if (expired) this.cookies.delete(c.name);
      else this.cookies.set(c.name, c.value);
    }
    let json: any;
    try {
      json = res.body ? JSON.parse(res.body) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.statusCode, json, body: res.body, headers: res.headers };
  }

  get(path: string) {
    return this.request('GET', path);
  }
  post(path: string, body?: unknown, opts?: { csrf?: string | null }) {
    return this.request('POST', path, body, opts);
  }
  put(path: string, body?: unknown) {
    return this.request('PUT', path, body);
  }
  patch(path: string, body?: unknown) {
    return this.request('PATCH', path, body);
  }
  delete(path: string) {
    return this.request('DELETE', path);
  }

  async fetchCsrf() {
    const r = await this.get('/auth/csrf');
    this.csrf = r.json.csrfToken;
    return this.csrf!;
  }

  /** CSRF + login; remembers the rotated token on success. */
  async login(email: string, password = PASSWORD) {
    if (!this.csrf) await this.fetchCsrf();
    const r = await this.post('/auth/login', { email, password });
    if (r.json?.session?.csrfToken) this.csrf = r.json.session.csrfToken;
    return r;
  }

  async loginOk(email = 'admin@force5.com') {
    const r = await this.login(email);
    if (r.status !== 200 || r.json.status !== 'ok') throw new Error(`login failed: ${r.status} ${r.body}`);
    return r;
  }
}

/** A complete, publishable account form (US address). */
export function fullAccountForm(overrides: Record<string, unknown> = {}) {
  return {
    name: `Test Account ${Math.random().toString(36).slice(2, 8)}`,
    languageId: 1,
    timeZoneName: 'America/New_York',
    labelVerticalId: 1,
    frameworkIds: [1, 2],
    requireMfa: false,
    active: true,
    mainContactFirstName: 'Pat',
    mainContactLastName: 'Tester',
    mainContactEmail: 'pat@test.example',
    mainContactMobile: '+1 404 555 0123',
    mainContactPhone: '',
    countryId: 1,
    address: '1 Test St',
    city: 'Atlanta',
    stateId: 11,
    provinceOrRegion: '',
    postalCode: '30309',
    ...overrides,
  };
}

export const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
