/**
 * Shared GET de-duplication for gateway calls (pure; covered by requestCache.test.ts).
 *
 * Several screens ask for the same data at the same moment (the Thông báo feed, the tab badge and Kho alerts all read
 * the notification list, dismissals and expiry alerts when a tab opens). Identical GETs (same path and token):
 * - in flight: share ONE request; each caller gets its own copy (`copy`, e.g. Response.clone()),
 * - just answered (within `ttlMs`, 2 s by default): reuse that answer,
 * - any write (POST / PUT / PATCH / DELETE) clears the cache, so changes are read fresh.
 * Failed requests are never cached.
 *
 * 429 handling: `retryDelayMs` turns the gateway's Retry-After into a wait (capped, so the app never hangs for long),
 * and the caller retries ONCE.
 */
export type RequestCache<T> = {
  get: (key: string, fetcher: () => Promise<T>) => Promise<T>;
  clear: () => void;
  size: () => number;
};

export function createRequestCache<T>(options: { ttlMs?: number; copy?: (value: T) => T; now?: () => number; keep?: (value: T) => boolean } = {}): RequestCache<T> {
  const ttl = options.ttlMs ?? 2000;
  const copy = options.copy ?? ((value: T) => value);
  const now = options.now ?? (() => Date.now());
  const inflight = new Map<string, Promise<T>>();
  const answered = new Map<string, { at: number; value: T }>();
  let generation = 0;
  return {
    get(key, fetcher) {
      const done = answered.get(key);
      if (done && now() - done.at < ttl) return Promise.resolve(copy(done.value));
      const running = inflight.get(key);
      if (running) return running.then(copy);
      const started = generation;
      const promise = fetcher().then((value) => {
        // A write happened meanwhile: do not keep this answer.
        if (started === generation && (options.keep?.(value) ?? true)) answered.set(key, { at: now(), value });
        return value;
      }).finally(() => { inflight.delete(key); });
      inflight.set(key, promise);
      return promise.then(copy);
    },
    clear() {
      generation += 1;
      answered.clear();
      inflight.clear();
    },
    size: () => answered.size + inflight.size,
  };
}

export const RATE_LIMIT_MAX_WAIT_MS = 5000;
export const RATE_LIMIT_FALLBACK_MS = 1500;

/** How long to wait before the one retry after a 429: Retry-After (seconds), capped; a short backoff without it. */
export function retryDelayMs(retryAfter: string | null | undefined, cap = RATE_LIMIT_MAX_WAIT_MS): number {
  const seconds = Number(retryAfter);
  if (!retryAfter || !Number.isFinite(seconds) || seconds <= 0) return RATE_LIMIT_FALLBACK_MS;
  return Math.min(cap, Math.ceil(seconds * 1000));
}
