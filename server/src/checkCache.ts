// In-memory cache of finished direct checks, keyed by site.
//
// A graded check costs real model money (several calls), so once any user
// has checked a site, everyone gets that result for CACHE_TTL_MS. Two
// requests for the same site at the same time share one run.
//
// Memory only: it empties when the server restarts (Render's free plan
// restarts after ~15 idle minutes). Results can be large (policy text), so
// the cache holds at most MAX_ENTRIES and drops the oldest first.

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 40;

interface Entry<T> {
  value: T;
  storedAt: number;
}

export class CheckCache<T> {
  private entries = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T>>();

  get(key: string): { value: T; storedAt: number } | undefined {
    const hit = this.entries.get(key);
    if (!hit) {
      return undefined;
    }
    if (Date.now() - hit.storedAt > CACHE_TTL_MS) {
      this.entries.delete(key);
      return undefined;
    }
    return hit;
  }

  /**
   * Run `work` unless a fresh cached value or an identical in-flight run
   * exists. Only values `shouldCache` accepts are stored (e.g. not partial
   * results), so a failed or incomplete check is retried next time.
   */
  async run(
    key: string,
    work: () => Promise<T>,
    shouldCache: (value: T) => boolean,
    opts: { fresh?: boolean } = {},
  ): Promise<{ value: T; cachedAt?: number }> {
    if (!opts.fresh) {
      const hit = this.get(key);
      if (hit) {
        return { value: hit.value, cachedAt: hit.storedAt };
      }
    }
    const pending = this.inflight.get(key);
    if (pending) {
      return { value: await pending };
    }
    const promise = work();
    this.inflight.set(key, promise);
    try {
      const value = await promise;
      if (shouldCache(value)) {
        this.entries.delete(key);
        this.entries.set(key, { value, storedAt: Date.now() });
        while (this.entries.size > MAX_ENTRIES) {
          const oldest = this.entries.keys().next().value as string;
          this.entries.delete(oldest);
        }
      }
      return { value };
    } finally {
      this.inflight.delete(key);
    }
  }
}
