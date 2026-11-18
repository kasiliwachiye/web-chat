/** Simple per-key token bucket for socket events (in-memory; move to Redis when scaling out). */
export class TokenBucket {
  private buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(private capacity: number, private refillPerSec: number) {}

  take(key: string): boolean {
    const now = Date.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, updated: now };
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.updated) / 1000) * this.refillPerSec);
    b.updated = now;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    return ok;
  }
}
