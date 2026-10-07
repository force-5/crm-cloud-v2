import { ERROR_CODES } from '@crm/contracts';
import { AppError } from '../errors';
import type { SharedState } from './shared-state';

/**
 * Fixed-window counter keyed by e.g. email (per-IP limits use @fastify/rate-limit). Backed by the
 * shared state, so it is atomic under parallel requests, bounded in memory, and — with Redis — enforced
 * across every BFF instance.
 */
export class KeyedLimiter {
  constructor(
    private readonly shared: SharedState,
    private readonly name: string,
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  private key(key: string) {
    return `limit:${this.name}:${key.toLowerCase()}`;
  }

  /** Throws 429 RATE_LIMITED when `key` has used up its window. */
  async hit(key: string) {
    const n = await this.shared.incr(this.key(key), this.windowMs);
    if (n > this.max) {
      throw new AppError(429, ERROR_CODES.RATE_LIMITED, 'Too many attempts. Please wait a few minutes and try again.');
    }
  }

  async reset(key: string) {
    await this.shared.del(this.key(key));
  }
}
