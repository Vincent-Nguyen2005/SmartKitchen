/**
 * Search helpers shared by every search box. Kept free of React Native imports so the plain Node unit tests run them.
 *
 * - Small lists (market catalog, admin catalog, recipes, admin users / families) are loaded once and searched on the
 *   device with `filterByName`: zero requests while typing.
 * - Lists that must stay on the server use `createServerSearch`: debounce, a minimum length, identical consecutive
 *   queries skipped, the previous request aborted and late answers ignored.
 */
import { normalizeVi } from "../screens/inventory/catalogSuggest";

export { normalizeVi };

/** Items whose name contains the typed text, case- and accent-insensitive ("ca rot" finds "Cà rốt"); order kept. */
export function filterByName<T>(items: readonly T[], term: string, nameOf: (item: T) => string = (item) => (item as { name: string }).name): T[] {
  const needle = normalizeVi(term);
  if (!needle) return [...items];
  return items.filter((item) => normalizeVi(nameOf(item) ?? "").includes(needle));
}

/** Every page of a paged endpoint (`maxPages` guards against a server that never reports the last page). */
export async function loadAllPages<T>(fetchPage: (page: number) => Promise<{ items: T[]; totalPages?: number; total?: number; limit?: number }>, maxPages = 20): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetchPage(page);
    items.push(...result.items);
    const totalPages = result.totalPages ?? (result.total !== undefined && result.limit ? Math.max(1, Math.ceil(result.total / result.limit)) : page);
    if (page >= totalPages || result.items.length === 0) break;
  }
  return items;
}

/**
 * A small dataset loaded once and shared (single flight: callers asking at the same time share one load). `get`
 * returns the cached copy while it is younger than `maxAgeMs`; `force` reloads (pull-to-refresh, after an edit).
 */
export type CachedList<T> = {
  get: (options?: { force?: boolean; maxAgeMs?: number }) => Promise<T[]>;
  /** The cached copy (any age), or null before the first load. */
  peek: () => T[] | null;
  invalidate: () => void;
};

export function createCachedList<T>(load: () => Promise<T[]>, defaultMaxAgeMs: number, now: () => number = Date.now): CachedList<T> {
  let value: T[] | null = null;
  let loadedAt = 0;
  let pending: Promise<T[]> | null = null;
  let generation = 0;
  return {
    get: ({ force = false, maxAgeMs = defaultMaxAgeMs } = {}) => {
      if (!force && value && now() - loadedAt < maxAgeMs) return Promise.resolve(value);
      if (pending) return pending;
      const current = generation;
      pending = load()
        .then((items) => {
          // A reload started after invalidate() wins; an older answer is still returned to its own caller.
          if (current === generation) { value = items; loadedAt = now(); }
          return items;
        })
        .finally(() => { pending = null; });
      return pending;
    },
    peek: () => value,
    invalidate: () => { value = null; loadedAt = 0; generation += 1; },
  };
}

export type ServerSearchOptions<R> = {
  /** Runs the request; must honour `signal` (aborted when a newer query starts). */
  run: (query: string, signal: AbortSignal) => Promise<R>;
  /** The latest query's answer; `null` when the text is shorter than `minLength` (results cleared). */
  onResult: (result: R | null, query: string) => void;
  onError?: (error: unknown, query: string) => void;
  debounceMs?: number;
  minLength?: number;
  /** Normalizes the text before comparing / sending (default: trim and collapse spaces). */
  normalize?: (text: string) => string;
};

export type ServerSearch = {
  /** Call on every keystroke. */
  input: (text: string) => void;
  /** Cancels the pending timer and the request in flight (unmount). */
  cancel: () => void;
};

/** Server-side search box: debounce 400 ms, at least 2 characters, no repeats, abort + ignore out-of-order answers. */
export function createServerSearch<R>({ run, onResult, onError, debounceMs = 400, minLength = 2, normalize = (text) => text.trim().replace(/\s+/g, " ") }: ServerSearchOptions<R>): ServerSearch {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let lastSent: string | null = null;
  let sequence = 0;
  const stopTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const abort = () => { controller?.abort(); controller = null; };
  return {
    input: (text: string) => {
      stopTimer();
      const query = normalize(text);
      if (query.length < minLength) {
        abort();
        sequence += 1;
        if (lastSent !== null) onResult(null, query);
        lastSent = null;
        return;
      }
      if (query === lastSent) return;
      timer = setTimeout(() => {
        timer = null;
        if (query === lastSent) return;
        abort();
        lastSent = query;
        const id = ++sequence;
        const own = new AbortController();
        controller = own;
        run(query, own.signal)
          .then((result) => { if (id === sequence && !own.signal.aborted) onResult(result, query); })
          .catch((error: unknown) => {
            if (id !== sequence || own.signal.aborted) return;
            // A failed query may be asked again (e.g. after the network comes back).
            lastSent = null;
            onError?.(error, query);
          })
          .finally(() => { if (controller === own) controller = null; });
      }, debounceMs);
    },
    cancel: () => { stopTimer(); abort(); sequence += 1; },
  };
}
