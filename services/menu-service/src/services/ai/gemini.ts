import { z } from "zod";
import { sameIngredient } from "../kho-suggest";
import type { HealthWarning } from "../family-health";
import type { AiFamilyBrief } from "./family-ai";

/**
 * Gemini text model over plain HTTPS (no SDK). Sent: Kho item names, quantities, units and an "expiring soon" flag,
 * plus the family's anonymous aggregates (people eating, combined allergies and conditions, kcal per meal; see
 * family-ai.ts). Never names, user ids or account data. The API key goes in the x-goog-api-key header and is never
 * logged.
 */

export const UNIT_CODES = ["GRAM", "KILOGRAM", "MILLILITER", "LITER", "PIECE", "PACK", "BOTTLE", "CAN", "BOX"] as const;
export const MAX_DISHES = 3;
/** Meal of an AI dish: sáng / trưa / tối (null = "Món khác"). */
export const MEAL_TYPES = ["sang", "trua", "toi"] as const;
export type AiMealType = (typeof MEAL_TYPES)[number];
export const MAX_STEPS = 15;
export const MAX_STEP_SECONDS = 7200;
const TIMEOUT_MS = 20_000;

export type KhoSnapshotItem = { name: string; quantity: number | null; unit: string | null; expiringSoon: boolean };
/**
 * isSeasoning: pantry staple (muối, nước mắm...): shown under "Gia vị", never counted as from Kho or missing.
 * perPerson: eaten one per person (portions.ts scales it per person).
 */
export type AiIngredient = { name: string; quantity: number | null; unit: string | null; fromKho: boolean; isSeasoning?: boolean; perPerson?: boolean };
export type AiStep = { order: number; instruction: string; durationSeconds: number | null; ingredients: string[] };
export type AiDish = {
  id: string;
  name: string;
  description: string;
  mealType: AiMealType | null;
  servings: number;
  totalMinutes: number;
  ingredients: AiIngredient[];
  steps: AiStep[];
  /** Per serving (null when the model gave none). */
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  /** Tags from the model (catalog names): allergens in the dish, conditions it is unsuitable for. */
  allergens?: string[];
  contraindications?: string[];
  /** Members for whom the dish is unsuitable (added locally by family-ai.ts, never sent to the model). */
  warnings?: HealthWarning[];
};

export type GeminiConfig = { apiKey: string; model: string };

/** Key and model from the environment; null when either is missing ("not_configured"). */
export function geminiConfig(env: NodeJS.ProcessEnv = process.env): GeminiConfig | null {
  const apiKey = env.GEMINI_API_KEY?.trim();
  const model = env.GEMINI_MODEL?.trim();
  return apiKey && model ? { apiKey, model } : null;
}

export class GeminiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "GeminiError";
  }
}

/** Structured output schema (Gemini's OpenAPI subset). */
export const responseSchema = {
  type: "OBJECT",
  properties: {
    dishes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          description: { type: "STRING" },
          mealType: { type: "STRING", enum: [...MEAL_TYPES] },
          servings: { type: "INTEGER" },
          totalMinutes: { type: "INTEGER" },
          calories: { type: "NUMBER" },
          protein: { type: "NUMBER" },
          carbs: { type: "NUMBER" },
          fat: { type: "NUMBER" },
          allergens: { type: "ARRAY", items: { type: "STRING" } },
          contraindications: { type: "ARRAY", items: { type: "STRING" } },
          ingredients: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                quantity: { type: "NUMBER", nullable: true },
                unit: { type: "STRING", enum: [...UNIT_CODES], nullable: true },
                fromKho: { type: "BOOLEAN" },
                isSeasoning: { type: "BOOLEAN" },
                perPerson: { type: "BOOLEAN" },
              },
              required: ["name", "fromKho"],
            },
          },
          steps: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                order: { type: "INTEGER" },
                instruction: { type: "STRING" },
                durationSeconds: { type: "INTEGER", nullable: true },
                ingredients: { type: "ARRAY", items: { type: "STRING" } },
              },
              required: ["order", "instruction"],
            },
          },
        },
        required: ["name", "mealType", "servings", "totalMinutes", "ingredients", "steps"],
      },
    },
  },
  required: ["dishes"],
} as const;

/** Catalog names the model should use for tags (same names as nutrition-service / recipe-service). */
const ALLERGEN_NAMES = "Tôm, Cua, Mực, Hải sản, Cá, Trứng, Sữa, Đậu phộng, Đậu nành, Gluten, Mè";
const CONDITION_NAMES = "Tiểu đường, Cao huyết áp, Gout, Mỡ máu cao";

/** Family lines of the prompt: anonymous aggregates only. */
function familyLines(brief: AiFamilyBrief | undefined): string[] {
  if (!brief) return [];
  return [
    `Số người ăn: ${brief.people}. Mỗi món nấu cho đúng ${brief.people} phần (servings = ${brief.people}); số lượng nguyên liệu là cho cả ${brief.people} người.`,
    ...(brief.mustNotContain.length > 0 ? [`TUYỆT ĐỐI KHÔNG dùng (dị ứng trong nhà): ${brief.mustNotContain.join(", ")}.`] : []),
    ...(brief.avoidIfPossible.length > 0 ? [`Tránh nếu có thể (tình trạng sức khỏe trong nhà): ${brief.avoidIfPossible.join(", ")}.`] : []),
    `Năng lượng cả nhà mỗi bữa (tổng): sáng khoảng ${brief.mealTargets.sang} kcal, trưa ${brief.mealTargets.trua} kcal, tối ${brief.mealTargets.toi} kcal.`,
  ];
}

export function buildPrompt(kho: KhoSnapshotItem[], brief?: AiFamilyBrief): string {
  const lines = kho.map((item) => {
    const amount = item.quantity !== null ? ` ${item.quantity}${item.unit ? ` ${item.unit}` : ""}` : "";
    return `- ${item.name}${amount}${item.expiringSoon ? " (sắp hết hạn)" : ""}`;
  });
  return [
    "Bạn là đầu bếp gia đình Việt Nam. Dựa trên nguyên liệu đang có trong kho dưới đây, hãy gợi ý 2 đến 3 món ăn gia đình Việt Nam phổ biến, dễ nấu.",
    "Ưu tiên dùng các nguyên liệu sắp hết hạn và dùng càng nhiều nguyên liệu trong kho càng tốt.",
    "Có thể thêm vài nguyên liệu thông dụng không có trong kho (đánh dấu fromKho=false).",
    "Liệt kê cả gia vị Việt Nam thường dùng (muối, tiêu, nước mắm, đường, hạt nêm, dầu ăn, nước tương, giấm; tỏi, hành tím, gừng, ớt khi dùng ít) với isSeasoning=true, quantity=null và lượng ghi trong unit=null.",
    `Đơn vị chỉ dùng một trong: ${UNIT_CODES.join(", ")}.`,
    "mealType là bữa phù hợp nhất: sang (bữa sáng), trua (bữa trưa) hoặc toi (bữa tối).",
    "calories, protein, carbs, fat là cho MỘT phần ăn (kcal và gam).",
    "perPerson=true cho nguyên liệu ăn mỗi người một phần (bánh mì, trứng ốp la, ly sữa, ly nước cam).",
    `allergens: chất gây dị ứng có trong món, chỉ dùng tên trong: ${ALLERGEN_NAMES}. contraindications: tình trạng nên tránh món này, chỉ dùng tên trong: ${CONDITION_NAMES}.`,
    ...familyLines(brief),
    `Mỗi món tối đa ${MAX_STEPS} bước, viết bằng tiếng Việt, ngắn gọn. durationSeconds là thời gian chờ/nấu của bước (null nếu không cần hẹn giờ). ingredients của bước là tên nguyên liệu cho vào ở bước đó.`,
    "Kho hiện có:",
    ...lines,
  ].join("\n");
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** Per-serving number clamped to 0..max with 1 decimal; null when missing. */
const perServing = (value: number | null | undefined, max: number): number | null =>
  value === null || value === undefined ? null : Math.round(clamp(value, 0, max) * 10) / 10;
const tags = (values: string[]): string[] => [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 20);
const nonEmpty = z.string().trim().min(1);

const rawDishSchema = z.object({
  name: nonEmpty.max(120),
  description: z.string().trim().max(500).optional().default(""),
  mealType: z.unknown().optional(),
  servings: z.number().finite(),
  totalMinutes: z.number().finite(),
  calories: z.number().finite().nullable().optional(),
  protein: z.number().finite().nullable().optional(),
  carbs: z.number().finite().nullable().optional(),
  fat: z.number().finite().nullable().optional(),
  allergens: z.array(z.string()).optional().default([]),
  contraindications: z.array(z.string()).optional().default([]),
  ingredients: z.array(z.object({
    name: nonEmpty.max(120),
    quantity: z.number().finite().positive().nullable().optional(),
    unit: z.string().nullable().optional(),
    fromKho: z.boolean().optional().default(false),
    isSeasoning: z.boolean().optional().default(false),
    perPerson: z.boolean().optional().default(false),
  })).min(1).max(40),
  steps: z.array(z.object({
    order: z.number().finite().optional(),
    instruction: nonEmpty.max(500),
    durationSeconds: z.number().finite().nullable().optional(),
    ingredients: z.array(z.string()).optional().default([]),
  })).min(1),
});

/**
 * Parses the model's JSON text. Dishes that fail validation are dropped; numbers are clamped (servings 1-10,
 * step timers 0-7200 s, at most 15 steps, at most 3 dishes, kcal 0-3000 and macros 0-300 g per serving).
 * `fromKho` is recomputed against the snapshot. Family rules (allergens, warnings) are applied by family-ai.ts.
 */
export function parseDishes(text: string, kho: KhoSnapshotItem[], idPrefix: string): AiDish[] {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new GeminiError("Model returned invalid JSON");
  }
  const list = (payload && typeof payload === "object" && Array.isArray((payload as { dishes?: unknown }).dishes))
    ? (payload as { dishes: unknown[] }).dishes
    : [];
  const dishes: AiDish[] = [];
  for (const entry of list) {
    const parsed = rawDishSchema.safeParse(entry);
    if (!parsed.success) continue;
    const dish = parsed.data;
    const ingredients = dish.ingredients.map((ingredient) => ({
      name: ingredient.name,
      quantity: ingredient.quantity ?? null,
      unit: ingredient.unit && (UNIT_CODES as readonly string[]).includes(ingredient.unit) ? ingredient.unit : null,
      // Seasonings are pantry staples: never "from Kho" nor missing.
      fromKho: ingredient.isSeasoning ? false : kho.some((item) => sameIngredient(item.name, ingredient.name)),
      isSeasoning: ingredient.isSeasoning,
      ...(ingredient.perPerson ? { perPerson: true } : {}),
    }));
    const steps = [...dish.steps]
      .map((step, index) => ({ step, index }))
      .sort((left, right) => (left.step.order ?? left.index + 1) - (right.step.order ?? right.index + 1) || left.index - right.index)
      .slice(0, MAX_STEPS)
      .map(({ step }, index) => ({
        order: index + 1,
        instruction: step.instruction,
        durationSeconds: step.durationSeconds === null || step.durationSeconds === undefined ? null : clamp(Math.round(step.durationSeconds), 0, MAX_STEP_SECONDS),
        ingredients: step.ingredients.map((name) => name.trim()).filter(Boolean).slice(0, 20),
      }));
    if (dishes.some((existing) => existing.name.toLocaleLowerCase("vi") === dish.name.toLocaleLowerCase("vi"))) continue;
    dishes.push({
      id: `${idPrefix}-${dishes.length + 1}`,
      name: dish.name,
      description: dish.description,
      // Anything other than sang / trua / toi goes to "Món khác".
      mealType: typeof dish.mealType === "string" && (MEAL_TYPES as readonly string[]).includes(dish.mealType.trim().toLowerCase())
        ? dish.mealType.trim().toLowerCase() as AiMealType
        : null,
      servings: clamp(Math.round(dish.servings), 1, 10),
      totalMinutes: clamp(Math.round(dish.totalMinutes), 1, 600),
      ingredients,
      steps,
      calories: perServing(dish.calories, 3000),
      protein: perServing(dish.protein, 300),
      carbs: perServing(dish.carbs, 300),
      fat: perServing(dish.fat, 300),
      allergens: tags(dish.allergens),
      contraindications: tags(dish.contraindications),
    });
    if (dishes.length >= MAX_DISHES) break;
  }
  return dishes;
}

/** One generateContent call (20 s timeout). Errors never include the key or the request headers. */
export async function generateDishes(kho: KhoSnapshotItem[], config: GeminiConfig, idPrefix: string, fetchImpl: typeof fetch = fetch, brief?: AiFamilyBrief): Promise<AiDish[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": config.apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(kho, brief) }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new GeminiError(error instanceof Error && error.name === "TimeoutError" ? "Model request timed out" : "Model request failed");
  }
  if (!response.ok) throw new GeminiError(`Model request failed with HTTP ${response.status}`, response.status);
  const body = await response.json().catch(() => null) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } | null;
  const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text) throw new GeminiError("Model returned no content");
  return parseDishes(text, kho, idPrefix);
}
