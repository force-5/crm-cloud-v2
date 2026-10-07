import { describe, expect, it, vi } from 'vitest';
import { loadAwsSecrets, type SecretFetcher } from '../src/aws-secrets';

const ok = (obj: unknown): SecretFetcher => vi.fn(async () => JSON.stringify(obj));

describe('loadAwsSecrets', () => {
  it('does nothing outside deployed environments', async () => {
    const fetch = vi.fn<SecretFetcher>();
    for (const APP_ENV of ['local', 'dev', undefined]) {
      expect(await loadAwsSecrets({ APP_ENV }, fetch)).toEqual([]);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('pins region and secret per environment, so test can never read prod', async () => {
    const fetch = ok({});
    await loadAwsSecrets({ APP_ENV: 'production' }, fetch);
    await loadAwsSecrets({ APP_ENV: 'staging' }, fetch);
    expect(fetch).toHaveBeenNthCalledWith(1, 'us-east-2', 'prod/crm/config');
    expect(fetch).toHaveBeenNthCalledWith(2, 'us-east-1', 'test/crm/config');
  });

  it('writes secret values into env (overriding EB properties) and returns only key names', async () => {
    const env: Record<string, string | undefined> = { APP_ENV: 'production', VMS_URL: 'http://from-eb-property' };
    const keys = await loadAwsSecrets(
      env,
      ok({ SESSION_SECRET: 's'.repeat(40), VMS_URL: 'https://api.force5.cloud/internal/v1/' }),
    );
    expect(keys).toEqual(['SESSION_SECRET', 'VMS_URL']);
    expect(env.VMS_URL).toBe('https://api.force5.cloud/internal/v1/');
    expect(env.SESSION_SECRET).toHaveLength(40);
  });

  it('fails startup when the secret is unreadable, empty, malformed, or has unknown keys', async () => {
    const env = () => ({ APP_ENV: 'production' });
    await expect(loadAwsSecrets(env(), vi.fn(async () => { throw new Error('AccessDenied'); }))).rejects.toThrow(
      /Could not read AWS secret prod\/crm\/config .*AccessDenied/,
    );
    await expect(loadAwsSecrets(env(), vi.fn(async () => undefined))).rejects.toThrow(/no SecretString/);
    await expect(loadAwsSecrets(env(), vi.fn(async () => 'not json'))).rejects.toThrow(/not valid JSON/);
    await expect(loadAwsSecrets(env(), ok(['x']))).rejects.toThrow(/JSON object/);
    await expect(loadAwsSecrets(env(), ok({ SESION_SECRET: 'typo' }))).rejects.toThrow(/unsupported keys: SESION_SECRET/);
    await expect(loadAwsSecrets(env(), ok({ VMS_URL: 42 }))).rejects.toThrow(/VMS_URL must be a string/);
  });
});
