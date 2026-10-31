// In-memory, per-caller rate limiting. No persistence, no tracking: the
// map holds only request timestamps keyed by caller IP, pruned on every
// check. This is abuse protection, not authentication — put real auth in
// front of this server before exposing it publicly.

export class RateLimiter {
  private hits = new Map<string, number[]>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 30, windowMs: number = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /** Returns true when the caller may proceed, false when rate-limited. */
  allow(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.maxRequests) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
