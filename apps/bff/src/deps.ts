import type { preHandlerAsyncHookHandler } from 'fastify';
import type { Config } from './config';
import type { SecretBox } from './auth/crypto';
import type { KeycloakClient } from './auth/keycloak';
import type { KeyedLimiter } from './auth/limiter';
import type { VmsClient } from './vms/client';
import { notFound } from './errors';

export type Deps = {
  config: Config;
  keycloak: KeycloakClient;
  vmsClient: VmsClient;
  secretBox: SecretBox;
  requireAuth: preHandlerAsyncHookHandler;
  loginLimiter: KeyedLimiter;
  recoveryLimiter: KeyedLimiter;
};

/** Parse a positive integer route id; anything else is a 404. */
export function idParam(params: unknown, key = 'id'): number {
  const raw = (params as Record<string, string | undefined>)[key];
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n <= 0) {
    throw notFound();
  }
  return n;
}
