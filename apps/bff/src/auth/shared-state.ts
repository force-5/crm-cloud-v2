import type { Redis } from 'ioredis';

/**
 * Security state that must be shared by every request (and, with Redis, every BFF instance), and
 * must NOT live in the session itself: a session is a per-request copy that's written back when the
 * request ends, so anything kept there can be overwritten by a concurrent request.
 *
 * - Revocation: destroyed session ids are tombstoned, so a request that was still in flight when the
 *   user logged out can't write the session back and revive it (security review M1).
 * - Counters: atomic attempt counts (MFA codes, one-shot pending password, per-email login limits), so
 *   parallel requests can't each see "0 attempts so far" (security review M2).
 */
export interface SharedState {
  revoke(sessionId: string, ttlMs: number): Promise<void>;
  isRevoked(sessionId: string): Promise<boolean>;
  /** Increments `key` and returns the new count. The window (ttlMs) starts at the first increment. */
  incr(key: string, ttlMs: number): Promise<number>;
  del(key: string): Promise<void>;
}

/** Single-instance implementation. Bounded, so a flood of unique keys can't grow memory forever. */
export class MemorySharedState implements SharedState {
  private readonly revoked = new Map<string, number>();
  private readonly counters = new Map<string, { n: number; exp: number }>();

  constructor(private readonly maxEntries = 100_000) {}

  private trim<V>(map: Map<string, V>, expiry: (v: V) => number) {
    if (map.size < this.maxEntries) return;
    const now = Date.now();
    for (const [k, v] of map) if (expiry(v) <= now) map.delete(k);
    // Still full: drop the oldest entries (Map iterates in insertion order).
    for (const k of map.keys()) {
      if (map.size < this.maxEntries) break;
      map.delete(k);
    }
  }

  async revoke(sessionId: string, ttlMs: number) {
    this.trim(this.revoked, (exp) => exp);
    this.revoked.set(sessionId, Date.now() + ttlMs);
  }

  async isRevoked(sessionId: string) {
    const exp = this.revoked.get(sessionId);
    if (exp === undefined) return false;
    if (exp <= Date.now()) {
      this.revoked.delete(sessionId);
      return false;
    }
    return true;
  }

  async incr(key: string, ttlMs: number) {
    const now = Date.now();
    const cur = this.counters.get(key);
    if (!cur || cur.exp <= now) {
      this.trim(this.counters, (v) => v.exp);
      this.counters.set(key, { n: 1, exp: now + ttlMs });
      return 1;
    }
    cur.n++;
    return cur.n;
  }

  async del(key: string) {
    this.counters.delete(key);
  }
}

export class RedisSharedState implements SharedState {
  constructor(
    private readonly client: Redis,
    private readonly prefix = 'crm:',
  ) {}

  async revoke(sessionId: string, ttlMs: number) {
    await this.client.set(`${this.prefix}revoked:${sessionId}`, '1', 'PX', ttlMs);
  }

  async isRevoked(sessionId: string) {
    return (await this.client.exists(`${this.prefix}revoked:${sessionId}`)) === 1;
  }

  async incr(key: string, ttlMs: number) {
    const k = `${this.prefix}count:${key}`;
    const [[, n]] = (await this.client.multi().incr(k).pexpire(k, ttlMs, 'NX').exec()) as [[unknown, number]];
    return n;
  }

  async del(key: string) {
    await this.client.del(`${this.prefix}count:${key}`);
  }
}
