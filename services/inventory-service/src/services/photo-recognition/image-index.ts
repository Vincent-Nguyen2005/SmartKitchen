import type { CatalogLabel } from "./catalog-labels";
import { embedImage, probabilities } from "./clip";

/**
 * Image-to-image signal for photo suggestions: CLIP embeddings of the catalog products' OWN images (the stored
 * imageUrl only; no other source is ever fetched), kept in memory and recomputed only when a product's image URL
 * changes. Built in the background, one image at a time with a pause, so it never blocks a request; on HTTP 429
 * it stops for 10 minutes. Until built, products simply have no image score (text score only).
 */
type Entry = { url: string; vector: Float32Array };
export type ImageIndexDeps = {
  fetchImpl: typeof fetch;
  embed: (image: Buffer) => Promise<Float32Array>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

const PACE_MS = 2000;
const PAUSE_ON_429_MS = 10 * 60 * 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const USER_AGENT = "SmartKitchenInventory/1.0 (catalog image embeddings; one request at a time)";

export function createImageIndex(deps: ImageIndexDeps) {
  const entries = new Map<string, Entry>();
  let running = false;
  let pausedUntil = 0;

  const stale = (catalog: CatalogLabel[]) => catalog.filter((entry) => entry.imageUrl && /^https:\/\//i.test(entry.imageUrl) && entries.get(entry.id)?.url !== entry.imageUrl);

  /** Starts (in the background) embedding products whose image is new or changed. Returns immediately. */
  function refresh(catalog: CatalogLabel[]): void {
    const ids = new Set(catalog.map((entry) => entry.id));
    for (const id of entries.keys()) if (!ids.has(id)) entries.delete(id);
    if (running || deps.now() < pausedUntil || stale(catalog).length === 0) return;
    running = true;
    void (async () => {
      try {
        for (const entry of stale(catalog)) {
          const url = entry.imageUrl as string;
          try {
            const response = await deps.fetchImpl(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15_000) });
            if (response.status === 429) { pausedUntil = deps.now() + PAUSE_ON_429_MS; break; }
            if (!response.ok) continue;
            const image = Buffer.from(await response.arrayBuffer());
            if (image.length === 0 || image.length > MAX_IMAGE_BYTES) continue;
            entries.set(entry.id, { url, vector: await deps.embed(image) });
          } catch {
            // Unreachable or undecodable image: try again on a later refresh.
          }
          await deps.sleep(PACE_MS);
        }
      } finally {
        running = false;
      }
    })();
  }

  /**
   * Image score per product id: softmax over 100 × cosine(photo, product image) among the products whose current
   * image is embedded (same scale as the text scores). Empty map when none is embedded yet.
   */
  function scores(photo: Float32Array, catalog: CatalogLabel[]): Map<string, number> {
    const ready = catalog.filter((entry) => entry.imageUrl && entries.get(entry.id)?.url === entry.imageUrl);
    if (ready.length === 0) return new Map();
    const probs = probabilities(photo, ready.map((entry) => (entries.get(entry.id) as Entry).vector));
    return new Map(ready.map((entry, index) => [entry.id, probs[index]]));
  }

  return { refresh, scores, size: () => entries.size };
}

export type ImageIndex = ReturnType<typeof createImageIndex>;

/** Process-wide index. */
export const catalogImageIndex = createImageIndex({
  fetchImpl: fetch,
  embed: embedImage,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: Date.now,
});
