import { loadCatalogLabels, type CatalogLabel } from "./catalog-labels";
import { clipClassifier, ClipUnavailableError, embedImage, type ImageClassifier } from "./clip";
import { catalogImageIndex } from "./image-index";
import { createDailyLimit, createGeminiPicker, geminiConfig, type GeminiPicker } from "./gemini";

/**
 * Kho "Chụp ảnh": ingredient names suggested from a photo (the photo is never stored here).
 * 1. CLIP over the catalog's English aliases; confident when the top probability reaches CLIP_THRESHOLD.
 * 2. Otherwise Gemini (when configured and the family's daily limit allows) picks from the same catalog names.
 * 3. Otherwise no suggestion (confident = false). Saving the item never waits on or depends on this.
 */
/** productId = catalogId (the admin catalog product); imageUrl = that product's image (shown in the add form). */
export type PhotoSuggestion = { name: string; catalogId: string; productId: string; imageUrl: string | null; score: number | null };
/**
 * confident: CLIP reached CLIP_THRESHOLD or Gemini matched the catalog. autofill: the app may put the top name in Tên
 * by itself (otherwise it only shows the suggestions to tap).
 */
export type SuggestResult = { suggestions: PhotoSuggestion[]; confident: boolean; autofill: boolean; source: "clip" | "gemini" | null };

/**
 * Top-1 probability (softmax over ~100 catalog labels) needed to trust CLIP. Tuned on 47 test photos (README): at 0.4,
 * 30 photos are "confident", 67% of those have the right top name (77% have it among the 3 chips), and 20 of the 24
 * correct answers are kept. Higher values mostly drop correct answers, because the wrong ones are confident
 * look-alikes (Bơ lạt / Quả bơ, Đậu xanh / Đậu Hà Lan). Below it, Gemini gets the photo.
 */
export const CLIP_THRESHOLD = Number(process.env.PHOTO_CLIP_THRESHOLD) || 0.4;
export const CLIP_TIMEOUT_MS = 8000;
/**
 * Final CLIP score needed to fill Tên automatically. On the PR #89 set (47 photos): >= 0.6 fills 14, 11 right (79%),
 * 3 wrong; >= 0.4 would fill 30 with 10 wrong; >= 0.7 fills 11 with 2 wrong. Below it the user picks a suggestion.
 */
export const AUTOFILL_MIN_SCORE = 0.6;
export const GEMINI_DAILY_LIMIT = Number(process.env.PHOTO_GEMINI_DAILY_LIMIT) || 20;
const MAX_SUGGESTIONS = 3;
/**
 * Image-to-image signal (photo vs the catalog products' own images). Off by default: on the PR #89 evaluation set it
 * cannot be measured fairly (those test photos ARE the catalog images), see README. PHOTO_IMAGE_MATCH=on enables it.
 */
export const IMAGE_MATCH_ENABLED = process.env.PHOTO_IMAGE_MATCH === "on";

export type SuggestDeps = {
  loadCatalog: (userId: string) => Promise<CatalogLabel[]>;
  classify: ImageClassifier;
  gemini: GeminiPicker | null;
  geminiAllowed: (familyId: string) => boolean;
  threshold: number;
  /** Image score per product id (null = feature off). Combined with the text score as max(text, image). */
  imageScores?: ((image: Buffer, catalog: CatalogLabel[]) => Promise<Map<string, number>>) | null;
  log: (event: string, details: Record<string, unknown>) => void;
};

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timeout")), ms);
  promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
});

const NONE: SuggestResult = { suggestions: [], confident: false, autofill: false, source: null };

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

    const suggestion = (entry: CatalogLabel, score: number | null): PhotoSuggestion =>
      ({ name: entry.name, catalogId: entry.id, productId: entry.id, imageUrl: entry.imageUrl ?? null, score: score === null ? null : Math.round(score * 1000) / 1000 });

    // CLIP's best guesses, kept to show as tap-to-fill suggestions when nobody is sure.
    let unsure: PhotoSuggestion[] = [];
    const labelled = catalog.filter((entry) => entry.englishName);
    if (labelled.length > 0) {
      try {
        const scores = await withTimeout(deps.classify(input.image, labelled.map((entry) => entry.englishName as string)), CLIP_TIMEOUT_MS);
        const final = new Map(labelled.map((entry, index) => [entry.id, scores[index] ?? 0]));
        // Image signal: final = max(text, image). A strong visual match can win, and products without an image
        // keep their text score (a weighted blend would pull those down). The same threshold applies to `final`.
        if (deps.imageScores) {
          try {
            const images = await withTimeout(deps.imageScores(input.image, catalog), CLIP_TIMEOUT_MS);
            for (const [id, score] of images) final.set(id, Math.max(final.get(id) ?? 0, score));
          } catch (error) {
            deps.log("photo_suggest_image_match_failed", { message: error instanceof Error ? error.message : String(error) });
          }
        }
        const byId = new Map(catalog.map((entry) => [entry.id, entry]));
        const ranked = [...final].map(([id, score]) => ({ entry: byId.get(id) as CatalogLabel, score })).filter(({ entry }) => entry).sort((left, right) => right.score - left.score);
        const top = ranked.slice(0, MAX_SUGGESTIONS).map(({ entry, score }) => suggestion(entry, score));
        if (ranked.length > 0 && ranked[0].score >= deps.threshold) {
          return { suggestions: top, confident: true, autofill: ranked[0].score >= AUTOFILL_MIN_SCORE, source: "clip" };
        }
        unsure = top;
      } catch (error) {
        if (!(error instanceof ClipUnavailableError)) deps.log("photo_suggest_clip_failed", { message: error instanceof Error ? error.message : String(error) });
      }
    }

    if (deps.gemini && deps.geminiAllowed(input.familyId)) {
      try {
        const names = await deps.gemini(input.image, input.mimeType, catalog.map((entry) => entry.name));
        const byName = new Map(catalog.map((entry) => [entry.name, entry]));
        // Anything that is not a catalog ingredient is discarded.
        const suggestions = names.flatMap((name) => { const entry = byName.get(name); return entry ? [suggestion(entry, null)] : []; });
        // A Gemini answer that matched the catalog may fill Tên.
        if (suggestions.length > 0) return { suggestions, confident: true, autofill: true, source: "gemini" };
      } catch (error) {
        deps.log("photo_suggest_gemini_failed", { message: error instanceof Error ? error.message : String(error) });
      }
    }
    // Nobody is sure: CLIP's top guesses are still offered to tap (Tên stays empty).
    return unsure.length > 0 ? { suggestions: unsure, confident: false, autofill: false, source: "clip" } : NONE;
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
  imageScores: IMAGE_MATCH_ENABLED
    ? async (image, catalog) => {
      catalogImageIndex.refresh(catalog);
      if (catalogImageIndex.size() === 0) return new Map();
      return catalogImageIndex.scores(await embedImage(image), catalog);
    }
    : null,
  log: (event, details) => console.error(JSON.stringify({ event, ...details })),
});
