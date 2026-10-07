import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

/**
 * Deployed environments that load configuration from AWS Secrets Manager, keyed by APP_ENV.
 * Mirrors admin-cloud-v2's AwsSecretsPropertyPostProcessor: each entry pins its own region and secret,
 * so a test instance can never read production credentials (and vice versa). Neither is configurable
 * from the environment on purpose.
 *
 * `local` and `dev` never touch AWS. CI's smoke boot runs as `dev`, so it exercises the production
 * config rules without needing credentials.
 */
export const AWS_SECRET_PROFILES: Readonly<Record<string, { region: string; secretId: string }>> = Object.freeze({
  production: { region: 'us-east-2', secretId: 'prod/crm/config' },
  staging: { region: 'us-east-1', secretId: 'test/crm/config' },
});

/**
 * Keys the secret may set. The secret is a JSON object of environment variable names to values, e.g.
 * `{"SESSION_SECRET": "...", "VMS_URL": "...", "KEYCLOAK_URL": "...", "REDIS_URL": "..."}`.
 * Anything else in the secret is rejected, so a typo fails the deploy instead of being ignored.
 */
export const SECRET_KEYS = [
  'SESSION_SECRET',
  'VMS_URL',
  'KEYCLOAK_URL',
  'REDIS_URL',
  'SENTRY_DSN',
  'SENTRY_WEB_DSN',
  'CRM_ALLOWED_ROLES',
  'CRM_ALLOWED_TENANT_IDS',
] as const;

export type SecretFetcher = (region: string, secretId: string) => Promise<string | undefined>;

const fetchFromSecretsManager: SecretFetcher = async (region, secretId) => {
  const client = new SecretsManagerClient({ region });
  try {
    const r = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
    return r.SecretString;
  } finally {
    client.destroy();
  }
};

/**
 * For a deployed APP_ENV, loads its secret and writes the values into `env`. Secret values take
 * precedence over EB environment properties, because secrets belong in Secrets Manager only.
 * Throws (so startup aborts) when the secret can't be read or parsed: an instance that came up
 * without them would pass its health check and then fail every request.
 *
 * Returns the names of the keys it loaded, never the values, so they can be logged.
 */
export async function loadAwsSecrets(
  env: Record<string, string | undefined> = process.env,
  fetchSecret: SecretFetcher = fetchFromSecretsManager,
): Promise<string[]> {
  const profile = AWS_SECRET_PROFILES[env.APP_ENV ?? ''];
  if (!profile) return [];

  let raw: string | undefined;
  try {
    raw = await fetchSecret(profile.region, profile.secretId);
  } catch (err) {
    throw new Error(
      `Could not read AWS secret ${profile.secretId} (${profile.region}) for APP_ENV=${env.APP_ENV}: ` +
        `${(err as Error).message}. Check that the secret exists and the instance role can read it.`,
    );
  }
  if (!raw) throw new Error(`AWS secret ${profile.secretId} (${profile.region}) has no SecretString.`);

  let values: unknown;
  try {
    values = JSON.parse(raw);
  } catch {
    throw new Error(`AWS secret ${profile.secretId} is not valid JSON.`);
  }
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new Error(`AWS secret ${profile.secretId} must be a JSON object of environment variable names.`);
  }

  const allowed = new Set<string>(SECRET_KEYS);
  const unknown = Object.keys(values).filter((k) => !allowed.has(k));
  if (unknown.length) {
    throw new Error(`AWS secret ${profile.secretId} has unsupported keys: ${unknown.join(', ')}.`);
  }

  const loaded: string[] = [];
  for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
    if (typeof value !== 'string') throw new Error(`AWS secret ${profile.secretId}: ${key} must be a string.`);
    env[key] = value;
    loaded.push(key);
  }
  return loaded.sort();
}
