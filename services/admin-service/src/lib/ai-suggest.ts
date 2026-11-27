/**
 * Quản trị › "Chụp ảnh": Gemini suggestions for a NEW ingredient or dish from a photo (admin only). The suggestions
 * only prefill the create form: the admin reviews and saves; nothing is stored by this step (the photo is re-encoded
 * in memory, sent to Gemini and dropped; only the photo the admin finally saves is uploaded).
 *
 * Gemini over plain HTTPS (no SDK), model from GEMINI_MODEL, key from GEMINI_API_KEY (x-goog-api-key header, never
 * logged), strict JSON with a response schema, temperature 0. Every value is validated here against the same rules
 * as the admin forms; anything invalid or unknown becomes empty (null / "" / []), never a guess of ours.
 */
export const UNIT_CODES = ["GRAM", "KILOGRAM", "MILLILITER", "LITER", "PIECE", "PACK", "BOTTLE", "CAN", "BOX"] as const;
export type UnitCode = (typeof UNIT_CODES)[number];
const PIECE_UNITS: readonly string[] = ["PIECE", "BOTTLE", "CAN", "BOX"];
export const UNIT_WORDS = ["cái", "quả", "trái", "chai", "lon", "hộp", "nải", "bìa"] as const;
export const ALLERGENS = ["đậu phộng", "hạt cây", "sữa", "trứng", "hải sản", "cá", "đậu nành", "gluten", "mè"] as const;
export const CUISINES = ["vietnam", "western", "asian"] as const;
export const MAX_AI_STEPS = 15;
export const MAX_AI_INGREDIENTS = 40;
export const AI_TIMEOUT_MS = 20_000;

export type GeminiConfig = { apiKey: string; model: string };
export const geminiConfig = (env: NodeJS.ProcessEnv = process.env): GeminiConfig | null => {
  const apiKey = env.GEMINI_API_KEY?.trim();
  const model = env.GEMINI_MODEL?.trim();
  return apiKey && model ? { apiKey, model } : null;
};

/** Accent- and case-insensitive key (same idea as MasterIngredient.nameNormalized). */
export const nameKey = (value: string): string => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase().trim().replace(/\s+/g, " ");

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed && trimmed.length <= max ? trimmed : null;
};
const intIn = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isFinite(value) && Math.round(value) >= min && Math.round(value) <= max ? Math.round(value) : null;
const numIn = (value: unknown, min: number, max: number, digits = 1): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? Math.round(value * 10 ** digits) / 10 ** digits : null;
const meta = (raw: Record<string, unknown>) => ({ confidence: numIn(raw.confidence, 0, 1, 2), notes: text(raw.notes, 300) });

export type IngredientSuggestion = {
  name: string | null; category: string | null; defaultUnit: UnitCode | null; unitLabel: string | null; packGrams: number | null; pieceGrams: number | null;
  englishName: string | null; caloriesPer100g: number | null; proteinPer100g: number | null; carbsPer100g: number | null; fatPer100g: number | null;
  allergens: string[]; shelfLifeDays: number | null; price: number | null; confidence: number | null; notes: string | null;
};

/** Raw Gemini JSON → a suggestion that passes the ingredient form's rules. `groups`: the catalog's existing groups. */
export function validateIngredientSuggestion(raw: unknown, groups: string[]): IngredientSuggestion {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const unit = typeof value.defaultUnit === "string" && (UNIT_CODES as readonly string[]).includes(value.defaultUnit.toUpperCase()) ? value.defaultUnit.toUpperCase() as UnitCode : null;
  const groupText = text(value.category, 80);
  const category = groupText ? groups.find((group) => nameKey(group) === nameKey(groupText)) ?? null : null;
  const word = typeof value.unitLabel === "string" ? value.unitLabel.trim().toLowerCase() : "";
  const allergens = Array.isArray(value.allergens)
    ? [...new Set(value.allergens.flatMap((entry) => (typeof entry === "string" ? ALLERGENS.filter((known) => nameKey(known) === nameKey(entry)) : [])))]
    : [];
  return {
    name: text(value.name, 120),
    category,
    defaultUnit: unit,
    // Only for piece-type units, only the fixed words (the form's "Gọi 1 đơn vị là").
    unitLabel: unit && PIECE_UNITS.includes(unit) && (UNIT_WORDS as readonly string[]).includes(word) ? word : null,
    // Weight of one sale unit: packs and piece-type units; weight of one piece: kg and pack products.
    packGrams: unit && (unit === "PACK" || PIECE_UNITS.includes(unit)) ? intIn(value.packGrams, 1, 100_000) : null,
    pieceGrams: unit && (unit === "KILOGRAM" || unit === "PACK") ? intIn(value.pieceGrams, 1, 100_000) : null,
    englishName: text(value.englishName, 120)?.toLowerCase() ?? null,
    caloriesPer100g: numIn(value.caloriesPer100g, 0, 900, 0),
    proteinPer100g: numIn(value.proteinPer100g, 0, 100),
    carbsPer100g: numIn(value.carbsPer100g, 0, 100),
    fatPer100g: numIn(value.fatPer100g, 0, 100),
    allergens,
    shelfLifeDays: intIn(value.shelfLifeDays, 1, 3650),
    // Whole VND, at most 1 000 000 000 (the form's rule); rounded to 500 đ like shop prices.
    price: typeof value.price === "number" && Number.isFinite(value.price) && value.price > 0 && value.price <= 1_000_000_000 ? Math.max(500, Math.round(value.price / 500) * 500) : null,
    ...meta(value),
  };
}

export type CatalogEntry = { name: string; englishName: string | null };
export type RecipeSuggestion = {
  name: string | null; cuisine: (typeof CUISINES)[number] | null; servings: number | null; caloriesPerServing: number | null;
  /** Lines whose name matched a catalog product (the product's own name). */
  ingredients: Array<{ name: string; quantity: number | null; unit: UnitCode | null }>;
  /** Names the AI gave that are not in the catalog (shown to the admin, not added). */
  unmatched: string[];
  steps: string[];
  confidence: number | null; notes: string | null;
};

const CUISINE_ALIASES: Record<string, (typeof CUISINES)[number]> = { vietnam: "vietnam", vn: "vietnam", viet: "vietnam", western: "western", au: "western", asian: "asian", asia: "asian", a: "asian" };

/** Raw Gemini JSON → a suggestion that passes the recipe form's rules, ingredients mapped to the catalog. */
export function validateRecipeSuggestion(raw: unknown, catalog: CatalogEntry[]): RecipeSuggestion {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const byKey = new Map<string, string>();
  for (const product of catalog) {
    byKey.set(nameKey(product.name), product.name);
    if (product.englishName) byKey.set(nameKey(product.englishName), product.name);
  }
  const ingredients: RecipeSuggestion["ingredients"] = [];
  const unmatched: string[] = [];
  for (const entry of (Array.isArray(value.ingredients) ? value.ingredients : []).slice(0, MAX_AI_INGREDIENTS)) {
    const line = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const name = text(line.name, 120);
    if (!name) continue;
    const product = byKey.get(nameKey(name));
    if (!product) { if (!unmatched.some((known) => nameKey(known) === nameKey(name))) unmatched.push(name); continue; }
    if (ingredients.some((known) => known.name === product)) continue;
    const quantity = numIn(line.quantity, 0.001, 100_000, 3);
    const unit = typeof line.unit === "string" && (UNIT_CODES as readonly string[]).includes(line.unit.toUpperCase()) ? line.unit.toUpperCase() as UnitCode : null;
    // A quantity needs a unit (and the other way round), like the recipe form.
    ingredients.push(quantity !== null && quantity > 0 && unit ? { name: product, quantity, unit } : { name: product, quantity: null, unit: null });
  }
  const cuisineText = typeof value.cuisine === "string" ? value.cuisine.trim().toLowerCase() : "";
  return {
    name: text(value.name, 160),
    cuisine: CUISINE_ALIASES[cuisineText] ?? null,
    servings: intIn(value.servings, 1, 100),
    caloriesPerServing: numIn(value.caloriesPerServing, 0, 10_000, 0),
    ingredients,
    unmatched,
    steps: (Array.isArray(value.steps) ? value.steps : []).flatMap((step) => { const sentence = text(step, 500); return sentence ? [sentence] : []; }).slice(0, MAX_AI_STEPS),
    ...meta(value),
  };
}

export const ingredientPrompt = (groups: string[]): string => [
  "Ảnh chụp một nguyên liệu / sản phẩm thực phẩm bán ở chợ hoặc siêu thị Việt Nam.",
  "Gợi ý thông tin để tạo sản phẩm mới trong danh mục. Chỉ điền khi khá chắc chắn; không chắc thì để null.",
  `category: chọn đúng một nhóm trong danh sách (giữ nguyên chữ): ${groups.join("; ") || "(chưa có nhóm)"}.`,
  `defaultUnit (đơn vị bán): một trong ${UNIT_CODES.join(", ")}. unitLabel (chỉ cho PIECE/BOTTLE/CAN/BOX): một trong ${UNIT_WORDS.join(", ")}.`,
  "packGrams: khối lượng (g) hoặc thể tích (ml) của 1 đơn vị bán cho PACK/PIECE/BOTTLE/CAN/BOX. pieceGrams: khối lượng 1 quả/củ cho KILOGRAM/PACK.",
  `allergens: chỉ từ danh sách: ${ALLERGENS.join(", ")}.`,
  "Dinh dưỡng trên 100 g (kcal, đạm, tinh bột, béo theo gam). shelfLifeDays: số ngày dùng được khi bảo quản thông thường.",
  "price: giá bán lẻ ước tính bằng đồng cho 1 đơn vị bán. name: tên tiếng Việt thông dụng; englishName: tên tiếng Anh ngắn, chữ thường.",
  "confidence: 0 đến 1. notes: một câu ngắn tiếng Việt nếu cần lưu ý. Chỉ trả về JSON.",
].join("\n");

export const recipePrompt = (): string => [
  "Ảnh chụp một món ăn. Gợi ý thông tin để tạo món mới trong danh mục công thức.",
  "name: tên món tiếng Việt thông dụng. cuisine: vietnam, western hoặc asian. servings: số người ăn của công thức.",
  "caloriesPerServing: kcal ước tính cho 1 phần.",
  `ingredients: danh sách nguyên liệu chính (tên tiếng Việt thông dụng, quantity là số, unit là một trong ${UNIT_CODES.join(", ")}).`,
  `steps: tối đa ${MAX_AI_STEPS} bước nấu, mỗi bước là một câu ngắn tiếng Việt.`,
  "Không chắc thì để null hoặc mảng rỗng. confidence: 0 đến 1. notes: một câu ngắn nếu cần lưu ý. Chỉ trả về JSON.",
].join("\n");

const NULLABLE_STRING = { type: "STRING", nullable: true };
const NULLABLE_NUMBER = { type: "NUMBER", nullable: true };
export const INGREDIENT_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: NULLABLE_STRING, category: NULLABLE_STRING, defaultUnit: NULLABLE_STRING, unitLabel: NULLABLE_STRING, packGrams: NULLABLE_NUMBER, pieceGrams: NULLABLE_NUMBER,
    englishName: NULLABLE_STRING, caloriesPer100g: NULLABLE_NUMBER, proteinPer100g: NULLABLE_NUMBER, carbsPer100g: NULLABLE_NUMBER, fatPer100g: NULLABLE_NUMBER,
    allergens: { type: "ARRAY", items: { type: "STRING" } }, shelfLifeDays: NULLABLE_NUMBER, price: NULLABLE_NUMBER, confidence: NULLABLE_NUMBER, notes: NULLABLE_STRING,
  },
};
export const RECIPE_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: NULLABLE_STRING, cuisine: NULLABLE_STRING, servings: NULLABLE_NUMBER, caloriesPerServing: NULLABLE_NUMBER,
    ingredients: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, quantity: NULLABLE_NUMBER, unit: NULLABLE_STRING } } },
    steps: { type: "ARRAY", items: { type: "STRING" } }, confidence: NULLABLE_NUMBER, notes: NULLABLE_STRING,
  },
};

export type GeminiCaller = (image: Buffer, mimeType: string, prompt: string, schema: object) => Promise<unknown>;

export function createGeminiCaller(config: GeminiConfig, fetchImpl: typeof fetch = fetch, timeoutMs = AI_TIMEOUT_MS): GeminiCaller {
  return async (image, mimeType, prompt, schema) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": config.apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: image.toString("base64") } }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Gemini answered ${response.status}`);
    const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const answer = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    return JSON.parse(answer) as unknown;
  };
}

/** Per-admin daily limit (Vietnam day), in memory: resets when the service restarts. */
export function createDailyLimit(limit: number, now: () => Date = () => new Date()) {
  const used = new Map<string, number>();
  const day = () => new Date(now().getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  return {
    take(adminId: string): boolean {
      const key = `${day()}|${adminId}`;
      const count = used.get(key) ?? 0;
      if (count >= limit) return false;
      if (used.size > 10_000) used.clear();
      used.set(key, count + 1);
      return true;
    },
  };
}
