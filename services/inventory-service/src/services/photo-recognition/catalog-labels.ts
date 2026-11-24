/**
 * Candidate labels for photo recognition: the active admin catalog ingredients (id, Vietnamese name, English alias)
 * from admin-service's user catalog endpoint, cached for 10 minutes. admin-service trusts x-user-id on the private
 * network (the gateway sets it), so the caller's id is forwarded.
 */
/** imageUrl: the catalog product image (stored URL), used for previews and image-to-image matching. */
export type CatalogLabel = { id: string; name: string; englishName: string | null; imageUrl?: string | null };

const CACHE_MS = 10 * 60 * 1000;
const PAGE_SIZE = 50;
const MAX_PAGES = 10;
let cache: { at: number; labels: CatalogLabel[] } | null = null;

const baseUrl = (): string => (process.env.ADMIN_SERVICE_URL || "http://localhost:4011").replace(/\/+$/, "");

export async function loadCatalogLabels(userId: string, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): Promise<CatalogLabel[]> {
  if (cache && now() - cache.at < CACHE_MS) return cache.labels;
  const labels: CatalogLabel[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await fetchImpl(`${baseUrl()}/catalog/ingredients?page=${page}&limit=${PAGE_SIZE}`, {
      headers: { "x-user-id": userId },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Catalog answered ${response.status}`);
    const body = await response.json() as { items?: Array<{ id?: unknown; name?: unknown; englishName?: unknown; imageUrl?: unknown }>; totalPages?: number };
    for (const item of body.items ?? []) {
      if (typeof item.id !== "string" || typeof item.name !== "string") continue;
      const englishName = typeof item.englishName === "string" && item.englishName.trim() ? item.englishName.trim() : null;
      const imageUrl = typeof item.imageUrl === "string" && item.imageUrl ? item.imageUrl : null;
      labels.push({ id: item.id, name: item.name, englishName, imageUrl });
    }
    if (page >= (body.totalPages ?? 1)) break;
  }
  cache = { at: now(), labels };
  return labels;
}

/** Tests only. */
export const resetCatalogLabelCache = (): void => { cache = null; };
