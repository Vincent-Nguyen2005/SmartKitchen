import { loadCatalogLabels, type CatalogLabel } from "./catalog-labels";
import { clipClassifier, ClipUnavailableError, type ImageClassifier } from "./clip";
import { createDailyLimit, createGeminiPicker, geminiConfig, type GeminiPicker } from "./gemini";

/**
 * Kho "Chụp ảnh": ingredient names suggested from a photo (the photo is never stored here).
 * 1. CLIP over the catalog's English aliases; confident when the top probability reaches CLIP_THRESHOLD.
 * 2. Otherwise Gemini (when configured and the family's daily limit allows) picks from the same catalog names.
 * 3. Otherwise no suggestion (confident = false). Saving the item never waits on or depends on this.
 */
export type PhotoSuggestion = { name: string; catalogId: string; score: number | null };
export type SuggestResult = { suggestions: PhotoSuggestion[]; confident: boolean; source: "clip" | "gemini" | null };

/**
 * Top-1 probability (softmax over ~100 catalog labels) needed to trust CLIP. Tuned on 47 test photos (README): at 0.4,
 * 30 photos are "confident", 67% of those have the right top name (77% have it among the 3 chips), and 20 of the 24
 * correct answers are kept. Higher values mostly drop correct answers, because the wrong ones are confident
 * look-alikes (Bơ lạt / Quả bơ, Đậu xanh / Đậu Hà Lan). Below it, Gemini gets the photo.
 */
export const CLIP_THRESHOLD = Number(process.env.PHOTO_CLIP_THRESHOLD) || 0.4;
export const CLIP_TIMEOUT_MS = 8000;
export const GEMINI_DAILY_LIMIT = Number(process.env.PHOTO_GEMINI_DAILY_LIMIT) || 20;
const MAX_SUGGESTIONS = 3;

export type SuggestDeps = {
  loadCatalog: (userId: string) => Promise<CatalogLabel[]>;
  classify: ImageClassifier;
  gemini: GeminiPicker | null;
  geminiAllowed: (familyId: string) => boolean;
  threshold: number;
  log: (event: string, details: Record<string, unknown>) => void;
};

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timeout")), ms);
  promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
});

const NONE: SuggestResult = { suggestions: [], confident: false, source: null };

export function createPhotoSuggester(deps: SuggestDeps) {
  return async (input: { image: Buffer; mimeType: string; userId: string; familyId: string }): Promise<SuggestResult> => {
    let catalog: CatalogLabel[];
    try {
      catalog = await deps.loadCatalog(input.userId);
    } catch (error) {
      deps.log("photo_suggest_catalog_failed", { message: error instanceof Error ? error.message : String(error) });
      return NONE;
    }
    if (catalog.length === 0) return NONE;

    const labelled = catalog.filter((entry) => entry.englishName);
    if (labelled.length > 0) {
      try {
        const scores = await withTimeout(deps.classify(input.image, labelled.map((entry) => entry.englishName as string)), CLIP_TIMEOUT_MS);
        const ranked = labelled.map((entry, index) => ({ entry, score: scores[index] ?? 0 })).sort((left, right) => right.score - left.score);
        if (ranked.length > 0 && ranked[0].score >= deps.threshold) {
          return {
            suggestions: ranked.slice(0, MAX_SUGGESTIONS).map(({ entry, score }) => ({ name: entry.name, catalogId: entry.id, score: Math.round(score * 1000) / 1000 })),
            confident: true,
            source: "clip",
          };
        }
      } catch (error) {
        if (!(error instanceof ClipUnavailableError)) deps.log("photo_suggest_clip_failed", { message: error instanceof Error ? error.message : String(error) });
      }
    }

    if (deps.gemini && deps.geminiAllowed(input.familyId)) {
      try {
        const names = await deps.gemini(input.image, input.mimeType, catalog.map((entry) => entry.name));
        const byName = new Map(catalog.map((entry) => [entry.name, entry]));
        const suggestions = names.flatMap((name) => { const entry = byName.get(name); return entry ? [{ name: entry.name, catalogId: entry.id, score: null }] : []; });
        if (suggestions.length > 0) return { suggestions, confident: true, source: "gemini" };
      } catch (error) {
        deps.log("photo_suggest_gemini_failed", { message: error instanceof Error ? error.message : String(error) });
      }
    }
    return NONE;
  };
}

const geminiLimit = createDailyLimit(GEMINI_DAILY_LIMIT);
const config = geminiConfig();

/** Process-wide suggester (real catalog, CLIP and Gemini). */
export const suggestFromPhoto = createPhotoSuggester({
  loadCatalog: (userId) => loadCatalogLabels(userId),
  classify: clipClassifier,
  gemini: config ? createGeminiPicker(config) : null,
  geminiAllowed: (familyId) => geminiLimit.take(familyId),
  threshold: CLIP_THRESHOLD,
  log: (event, details) => console.error(JSON.stringify({ event, ...details })),
});
