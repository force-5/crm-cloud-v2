import { ERROR_CODES } from '@crm/contracts';
import { AppError } from '../errors';

/**
 * Fixed-window counter keyed by e.g. email (per-IP limits use @fastify/rate-limit).
 * In-memory: with several BFF instances each enforces its own window, which is acceptable
 * defence-in-depth next to Keycloak's own brute-force detection.
 */
export class KeyedLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Throws 429 RATE_LIMITED when `key` has used up its window. */
  hit(key: string) {
    const now = Date.now();
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    }
    const k = key.toLowerCase();
    const cur = this.hits.get(k);
    if (!cur || cur.resetAt <= now) {
      this.hits.set(k, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    cur.count++;
    if (cur.count > this.max) {
      throw new AppError(429, ERROR_CODES.RATE_LIMITED, 'Too many attempts. Please wait a few minutes and try again.');
    }
  }

  reset(key: string) {
    this.hits.delete(key.toLowerCase());
  }
}
