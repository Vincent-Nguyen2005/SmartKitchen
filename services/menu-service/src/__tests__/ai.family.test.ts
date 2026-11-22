import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../node_modules/.prisma/client-menu";
import { AiSuggestionEngine } from "../services/ai/ai-suggestions.service";
import { familyBrief, type AiFamilyBrief } from "../services/ai/family-ai";
import { generateDishes, parseDishes, type AiDish, type KhoSnapshotItem } from "../services/ai/gemini";
import { defaultMealTargets, type FamilyHealth, type MemberHealth } from "../services/family-health";
import type { KhoItem } from "../services/kho-suggest";

const config = { apiKey: "test-secret-key-0123456789", model: "some-model" };
const HUY = "aaaaaaaa-1111-4111-8111-111111111111";
const LAN = "bbbbbbbb-2222-4222-8222-222222222222";
const member = (userId: string, name: string, extra: Partial<MemberHealth> = {}): MemberHealth => ({ userId, name, allergies: [], conditions: [], mealTargets: defaultMealTargets(), ...extra });
const family = (extra: { huy?: Partial<MemberHealth>; lan?: Partial<MemberHealth> } = {}): FamilyHealth => ({
  members: [member(HUY, "Huy Nguyễn", { conditions: ["Tiểu đường"], ...extra.huy }), member(LAN, "Lan", { allergies: ["Tôm"], ...extra.lan })],
});
const snapshot: KhoSnapshotItem[] = [{ name: "Trứng", quantity: 6, unit: "PIECE", expiringSoon: false }];
const kho = (names: string[]): KhoItem[] => names.map((name) => ({ name, quantity: 2, unit: "PIECE", expiryDate: null }));
const aiDish = (name: string, extra: Partial<AiDish> = {}): AiDish => ({
  id: `x-${name}`, name, description: "", mealType: "trua", servings: 2, totalMinutes: 20,
  ingredients: [{ name: "Trứng gà", quantity: 2, unit: "PIECE", fromKho: true }],
  steps: [{ order: 1, instruction: "Nấu", durationSeconds: 60, ingredients: [] }], ...extra,
});

test("prompt: anonymous family aggregates only (people, allergies, conditions, kcal); no names or user ids", async () => {
  let body = "";
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    body = String(init.body);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ dishes: [] }) }] } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const brief = familyBrief(family());
  assert.deepEqual(brief, { people: 2, mustNotContain: ["Tôm"], avoidIfPossible: ["Tiểu đường"], mealTargets: { sang: 1000, trua: 1600, toi: 1400 } });
  await generateDishes(snapshot, config, "ai-1", fetchImpl, brief);
  const prompt = JSON.parse(body).contents[0].parts[0].text as string;
  assert.match(prompt, /Số người ăn: 2\. Mỗi món nấu cho đúng 2 phần \(servings = 2\)/);
  assert.match(prompt, /TUYỆT ĐỐI KHÔNG dùng \(dị ứng trong nhà\): Tôm/);
  assert.match(prompt, /Tránh nếu có thể .*: Tiểu đường/);
  assert.match(prompt, /sáng khoảng 1000 kcal, trưa 1600 kcal, tối 1400 kcal/);
  for (const secret of ["Huy", "Nguyễn", "Lan", HUY, LAN, "aaaaaaaa", "bbbbbbbb"]) assert.ok(!body.includes(secret), `request must not contain ${secret}`);
  const schema = JSON.parse(body).generationConfig.responseSchema.properties.dishes.items.properties;
  assert.ok(schema.calories && schema.protein && schema.carbs && schema.fat && schema.allergens && schema.contraindications);
  assert.ok(schema.ingredients.items.properties.perPerson);
});

test("parse: servings as asked (= people), per-serving macros clamped, perPerson and tags kept", () => {
  const [dish] = parseDishes(JSON.stringify({ dishes: [{
    name: "Bánh mì ốp la", servings: 4, totalMinutes: 15, calories: 420.26, protein: 18, carbs: 999, fat: -3,
    allergens: ["Trứng", "Gluten", " "], contraindications: ["Mỡ máu cao"],
    ingredients: [{ name: "Bánh mì", quantity: 4, unit: "PIECE", perPerson: true }, { name: "Trứng gà", quantity: 4, unit: "PIECE" }],
    steps: [{ instruction: "Chiên trứng" }],
  }] }), snapshot, "ai-x");
  assert.equal(dish.servings, 4);
  assert.deepEqual([dish.calories, dish.protein, dish.carbs, dish.fat], [420.3, 18, 300, 0]);
  assert.deepEqual(dish.allergens, ["Trứng", "Gluten"]);
  assert.deepEqual(dish.contraindications, ["Mỡ máu cao"]);
  assert.equal(dish.ingredients[0].perPerson, true);
  assert.equal(dish.ingredients[1].perPerson, undefined);
});

type Row = { familyId: string; dishes: unknown; khoHash: string; status: string; generatedAt: Date; generationDay: string; generationCount: number };

function harness(generate: (brief?: AiFamilyBrief) => AiDish[]) {
  const rows = new Map<string, Row>();
  const timers: Array<{ run: () => void; ms: number; cleared: boolean }> = [];
  const briefs: Array<AiFamilyBrief | undefined> = [];
  const client = {
    aiSuggestion: {
      findUnique: async ({ where }: { where: { familyId: string } }) => rows.get(where.familyId) ?? null,
      upsert: async ({ where, create, update }: { where: { familyId: string }; create: Row; update: Partial<Row> }) => {
        const existing = rows.get(where.familyId);
        const next = existing ? { ...existing, ...update } : { ...create, generatedAt: create.generatedAt ?? new Date() };
        rows.set(where.familyId, next as Row);
        return next;
      },
    },
  } as unknown as PrismaClient;
  const engine = new AiSuggestionEngine({
    client,
    config: () => config,
    generate: async (_snapshot, _config, _prefix, brief) => { briefs.push(brief); return generate(brief); },
    setTimer: (run, ms) => { const timer = { run, ms, cleared: false }; timers.push(timer); return timer; },
    clearTimer: (timer) => { (timer as { cleared: boolean }).cleared = true; },
    logError: () => undefined,
  });
  const flush = async () => {
    for (const timer of timers.filter((entry) => !entry.cleared)) { timer.cleared = true; timer.run(); }
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { engine, rows, timers, briefs, flush };
}

const FAMILY = "11111111-1111-4111-8111-111111111111";

test("engine: allergen dishes dropped, warnings attached for the family, servings = people in the request", async () => {
  const h = harness((brief) => [
    aiDish("Tôm rim", { servings: brief?.people ?? 1, ingredients: [{ name: "Tôm sú", quantity: 300, unit: "GRAM", fromKho: false }] }),
    aiDish("Chè đậu", { servings: brief?.people ?? 1, contraindications: ["tiểu đường"] }),
    aiDish("Trứng hấp", { servings: brief?.people ?? 1 }),
  ]);
  await h.engine.getSuggestions(FAMILY, kho(["Trứng"]), family());
  await h.flush();
  assert.equal(h.briefs[0]?.people, 2);
  const result = await h.engine.getSuggestions(FAMILY, kho(["Trứng"]), family());
  assert.equal(result.status, "ready");
  assert.deepEqual(result.dishes.map((entry) => entry.name), ["Chè đậu", "Trứng hấp"]);
  assert.ok(result.dishes.every((entry) => entry.servings === 2));
  assert.deepEqual(result.dishes[0].warnings, [{ memberUserId: HUY, memberName: "Huy Nguyễn", condition: "Tiểu đường" }]);
  assert.equal(result.dishes[1].warnings, undefined);
  // The stored dishes never contain the allergen dish either.
  assert.ok(!(h.rows.get(FAMILY)!.dishes as AiDish[]).some((entry) => entry.name === "Tôm rim"));
});

test("engine: a family context change invalidates the cache (debounced) and is applied to stored dishes at once", async () => {
  const h = harness(() => [aiDish("Trứng hấp"), aiDish("Gà luộc", { ingredients: [{ name: "Thịt gà", quantity: 300, unit: "GRAM", fromKho: false }] })]);
  await h.engine.getSuggestions(FAMILY, kho(["Trứng"]), family());
  await h.flush();
  assert.equal((await h.engine.getSuggestions(FAMILY, kho(["Trứng"]), family())).status, "ready");
  assert.equal(h.briefs.length, 1);

  // Same Kho, but Lan is now also allergic to chicken: regenerate (2 min debounce), and hide the chicken dish now.
  const changed = family({ lan: { allergies: ["Tôm", "Thịt gà"] } });
  const pending = await h.engine.getSuggestions(FAMILY, kho(["Trứng"]), changed);
  assert.equal(pending.status, "generating");
  assert.deepEqual(pending.dishes.map((entry) => entry.name), ["Trứng hấp"]);
  assert.equal(h.timers.filter((timer) => !timer.cleared).at(-1)?.ms, 120_000);
  await h.flush();
  assert.equal(h.briefs.length, 2);
  assert.deepEqual(h.briefs[1]?.mustNotContain, ["Thịt gà", "Tôm"]);

  // A name change alone does not regenerate.
  await h.engine.getSuggestions(FAMILY, kho(["Trứng"]), { members: changed.members.map((entry) => ({ ...entry, name: "Khác" })) });
  assert.equal(h.timers.filter((timer) => !timer.cleared).length, 0);
});
