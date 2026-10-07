import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

const SECRET = 'x'.repeat(32);

describe('config', () => {
  it('defaults to the local mock only when APP_ENV=local', () => {
    const c = loadConfig({ APP_ENV: 'local' });
    expect(c.vmsUrl).toBe('http://localhost:8090/vms/internal/v1/');
    expect(c.keycloak.realmUrl).toBe('http://localhost:8090/realms/gatekeeper');
  });

  it('fails fast outside local without VMS/Keycloak URLs or a session secret', () => {
    expect(() => loadConfig({ APP_ENV: 'production', SESSION_SECRET: SECRET })).toThrow(/VMS_URL is required[\s\S]*KEYCLOAK_URL is required/);
    expect(() =>
      loadConfig({ APP_ENV: 'production', VMS_URL: 'https://api.force5.cloud/internal/v1', KEYCLOAK_URL: 'https://keycloak.force5.cloud/realms' }),
    ).toThrow(/SESSION_SECRET is required/);
  });

  it('accepts a complete production config and normalises trailing slashes', () => {
    const c = loadConfig({
      APP_ENV: 'production',
      SESSION_SECRET: SECRET,
      VMS_URL: 'https://api.force5.cloud/internal/v1',
      KEYCLOAK_URL: 'https://keycloak.force5.cloud/realms',
    });
    expect(c.vmsUrl).toBe('https://api.force5.cloud/internal/v1/');
    expect(c.keycloak.realmUrl).toBe('https://keycloak.force5.cloud/realms/gatekeeper');
    expect(c.trustProxy).toBe(3); // CloudFront → ALB → nginx; not `true`, which is spoofable
  });

  it('accepts true/false or a hop count for TRUST_PROXY', () => {
    expect(loadConfig({ APP_ENV: 'local' }).trustProxy).toBe(false);
    expect(loadConfig({ APP_ENV: 'local', TRUST_PROXY: '2' }).trustProxy).toBe(2);
    expect(loadConfig({ APP_ENV: 'local', TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(() => loadConfig({ APP_ENV: 'local', TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/);
  });
});
