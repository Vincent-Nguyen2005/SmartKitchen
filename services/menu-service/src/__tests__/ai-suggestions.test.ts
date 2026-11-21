import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../node_modules/.prisma/client-menu";
import { AiSuggestionEngine, DAILY_LIMIT, khoSnapshot, snapshotHash } from "../services/ai/ai-suggestions.service";
import { generateDishes, GeminiError, geminiConfig, parseDishes, type AiDish, type KhoSnapshotItem } from "../services/ai/gemini";
import { vnDay, type KhoItem } from "../services/kho-suggest";

const KEY = "test-secret-key-0123456789";
const config = { apiKey: KEY, model: "some-flash-lite-model" };
const kho = (names: string[]): KhoItem[] => names.map((name) => ({ name, quantity: 2, unit: "PIECE", expiryDate: null }));
const dish = (name: string): AiDish => ({ id: `x-${name}`, name, description: "", servings: 2, totalMinutes: 20, ingredients: [{ name: "Trứng gà", quantity: 2, unit: "PIECE", fromKho: true }], steps: [{ order: 1, instruction: "Nấu", durationSeconds: 60, ingredients: [] }] });

const validJson = JSON.stringify({
  dishes: [
    {
      name: "Trứng xào cà chua", description: "Nhanh", servings: 25, totalMinutes: 15,
      ingredients: [{ name: "Trứng gà", quantity: 3, unit: "PIECE", fromKho: false }, { name: "Hành lá", quantity: 20, unit: "cup", fromKho: true }],
      steps: [
        { order: 2, instruction: "Đổ trứng vào đảo", durationSeconds: 99999, ingredients: ["Trứng gà"] },
        { order: 1, instruction: "Xào cà chua", durationSeconds: -5, ingredients: [] },
        ...Array.from({ length: 20 }, (_, index) => ({ order: 10 + index, instruction: `Bước thêm ${index}`, durationSeconds: null })),
      ],
    },
    { name: "", servings: 2, totalMinutes: 10, ingredients: [], steps: [] },
    { name: "Canh rau", servings: 0, totalMinutes: 10, ingredients: [{ name: "Rau ngót", fromKho: true }], steps: [{ instruction: "Nấu canh", durationSeconds: 300 }] },
  ],
});
const snapshot: KhoSnapshotItem[] = [{ name: "Trứng", quantity: 6, unit: "PIECE", expiringSoon: true }];

test("parseDishes: valid dishes clamped and renumbered, invalid dishes dropped, fromKho recomputed", () => {
  const dishes = parseDishes(validJson, snapshot, "ai-abc");
  assert.deepEqual(dishes.map((entry) => entry.name), ["Trứng xào cà chua", "Canh rau"]);
  const [first, second] = dishes;
  assert.equal(first.id, "ai-abc-1");
  assert.equal(first.servings, 10);
  assert.equal(second.servings, 1);
  assert.equal(first.steps.length, 15);
  assert.deepEqual(first.steps.slice(0, 2).map((step) => [step.order, step.instruction, step.durationSeconds]), [[1, "Xào cà chua", 0], [2, "Đổ trứng vào đảo", 7200]]);
  assert.deepEqual(first.ingredients.map((ingredient) => [ingredient.name, ingredient.unit, ingredient.fromKho]), [["Trứng gà", "PIECE", true], ["Hành lá", null, false]]);
  assert.throws(() => parseDishes("{not json", snapshot, "x"), GeminiError);
  assert.deepEqual(parseDishes(JSON.stringify({ something: 1 }), snapshot, "x"), []);
});

test("generateDishes sends only Kho data with the key in the header; HTTP errors never expose the key", async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const ok = (async (url: string, init: RequestInit) => {
    request = { url, init };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: validJson }] } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const dishes = await generateDishes(snapshot, config, "ai-1", ok);
  assert.equal(dishes.length, 2);
  const sent = request as unknown as { url: string; init: RequestInit };
  assert.equal(sent.url, "https://generativelanguage.googleapis.com/v1beta/models/some-flash-lite-model:generateContent");
  assert.equal((sent.init.headers as Record<string, string>)["x-goog-api-key"], KEY);
  const body = JSON.parse(String(sent.init.body));
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.ok(body.generationConfig.responseSchema.properties.dishes);
  assert.ok(!String(sent.init.body).includes(KEY));
  assert.match(body.contents[0].parts[0].text, /Trứng 6 PIECE \(sắp hết hạn\)/);

  const limited = (async () => new Response("quota", { status: 429 })) as unknown as typeof fetch;
  await assert.rejects(generateDishes(snapshot, config, "ai-1", limited), (error: unknown) => error instanceof GeminiError && error.status === 429 && !error.message.includes(KEY));
  const throwing = (async () => { throw new Error(`socket closed for key ${KEY}`); }) as unknown as typeof fetch;
  await assert.rejects(generateDishes(snapshot, config, "ai-1", throwing), (error: unknown) => error instanceof GeminiError && !error.message.includes(KEY));
});

test("config: missing key or model means not configured", () => {
  assert.equal(geminiConfig({}), null);
  assert.equal(geminiConfig({ GEMINI_API_KEY: KEY }), null);
  assert.equal(geminiConfig({ GEMINI_MODEL: "m" }), null);
  assert.deepEqual(geminiConfig({ GEMINI_API_KEY: ` ${KEY} `, GEMINI_MODEL: "m" }), { apiKey: KEY, model: "m" });
});

type Row = { familyId: string; dishes: unknown; khoHash: string; status: string; errorMessage?: string | null; generatedAt: Date; generationDay: string; generationCount: number };

function harness(options: { configured?: boolean; generate?: (snapshot: KhoSnapshotItem[]) => Promise<AiDish[]> } = {}) {
  const rows = new Map<string, Row>();
  const timers: Array<{ run: () => void; ms: number; cleared: boolean }> = [];
  const calls: KhoSnapshotItem[][] = [];
  const logs: string[] = [];
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
    config: () => (options.configured === false ? null : config),
    generate: async (snap) => { calls.push(snap); return options.generate ? options.generate(snap) : [dish("Món A"), dish("Món B")]; },
    setTimer: (run, ms) => { const timer = { run, ms, cleared: false }; timers.push(timer); return timer; },
    clearTimer: (timer) => { (timer as { cleared: boolean }).cleared = true; },
    logError: (message) => logs.push(message),
  });
  const activeTimers = () => timers.filter((timer) => !timer.cleared);
  const flush = async () => {
    for (const timer of activeTimers()) { timer.cleared = true; timer.run(); }
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { engine, rows, timers, activeTimers, calls, logs, flush };
}

const FAMILY = "11111111-1111-4111-8111-111111111111";

test("first read with Kho starts one generation right away and returns generating; then ready with dishes", async () => {
  const h = harness();
  const first = await h.engine.getSuggestions(FAMILY, kho(["Trứng", "Cà chua"]));
  assert.equal(first.status, "generating");
  assert.equal(h.activeTimers().length, 1);
  assert.equal(h.activeTimers()[0].ms, 0);
  await h.flush();
  assert.equal(h.calls.length, 1);
  const second = await h.engine.getSuggestions(FAMILY, kho(["Trứng", "Cà chua"]));
  assert.equal(second.status, "ready");
  assert.deepEqual(second.dishes.map((entry) => entry.name), ["Món A", "Món B"]);
});

test("debounce: several Kho changes within 2 minutes collapse into one call with the newest Kho", async () => {
  const h = harness();
  await h.engine.getSuggestions(FAMILY, kho(["Trứng"]));
  await h.flush();
  assert.equal(h.calls.length, 1);
  for (const names of [["Trứng", "Cà chua"], ["Trứng", "Cà chua", "Hành lá"], ["Trứng", "Hành lá"]]) {
    const result = await h.engine.getSuggestions(FAMILY, kho(names));
    assert.equal(result.status, "generating");
    assert.deepEqual(result.dishes.map((entry) => entry.name), ["Món A", "Món B"]);
  }
  assert.equal(h.activeTimers().length, 1);
  assert.equal(h.activeTimers()[0].ms, 120_000);
  // Reading again with the same Kho does not restart the 2 minutes.
  await h.engine.getSuggestions(FAMILY, kho(["Trứng", "Hành lá"]));
  assert.equal(h.activeTimers().length, 1);
  await h.flush();
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[1].map((item) => item.name), ["Hành lá", "Trứng"]);
});

test("unchanged Kho hash never calls the model again", async () => {
  const h = harness();
  const items = kho(["Trứng", "Cà chua"]);
  await h.engine.getSuggestions(FAMILY, items);
  await h.flush();
  for (let index = 0; index < 3; index += 1) assert.equal((await h.engine.getSuggestions(FAMILY, items)).status, "ready");
  assert.equal(h.activeTimers().length, 0);
  const snap = khoSnapshot(items, vnDay());
  await h.engine.run(FAMILY, snap, snapshotHash(snap));
  assert.equal(h.calls.length, 1);
});

test("daily limit: after 8 calls today the last result stays and nothing is scheduled", async () => {
  const h = harness();
  h.rows.set(FAMILY, { familyId: FAMILY, dishes: [dish("Món cũ")], khoHash: "old", status: "ready", generatedAt: new Date(), generationDay: vnDay(), generationCount: DAILY_LIMIT });
  const result = await h.engine.getSuggestions(FAMILY, kho(["Trứng"]));
  assert.equal(result.status, "ready");
  assert.equal(result.limitReached, true);
  assert.deepEqual(result.dishes.map((entry) => entry.name), ["Món cũ"]);
  assert.equal(h.activeTimers().length, 0);
  const snap = khoSnapshot(kho(["Trứng"]), vnDay());
  await h.engine.run(FAMILY, snap, snapshotHash(snap));
  assert.equal(h.calls.length, 0);
  // A new day resets the count.
  h.rows.set(FAMILY, { ...h.rows.get(FAMILY)!, generationDay: "2000-01-01" });
  assert.equal((await h.engine.getSuggestions(FAMILY, kho(["Trứng"]))).status, "generating");
});

test("missing key or model: not_configured; empty Kho: empty_kho; neither calls the model", async () => {
  const unconfigured = harness({ configured: false });
  assert.equal((await unconfigured.engine.getSuggestions(FAMILY, kho(["Trứng"]))).status, "not_configured");
  const h = harness();
  const expired: KhoItem[] = [{ name: "Sữa", quantity: 1, unit: "BOX", expiryDate: "2000-01-01T00:00:00.000Z" }];
  assert.equal((await h.engine.getSuggestions(FAMILY, [])).status, "empty_kho");
  assert.equal((await h.engine.getSuggestions(FAMILY, expired)).status, "empty_kho");
  assert.equal(unconfigured.timers.length + h.timers.length, 0);
});

test("model errors keep the previous dishes with status error, are not retried for the same Kho, and never log the key", async () => {
  let fail = false;
  const h = harness({ generate: async () => { if (fail) throw new GeminiError("Model request failed with HTTP 429", 429); return [dish("Món tốt")]; } });
  await h.engine.getSuggestions(FAMILY, kho(["Trứng"]));
  await h.flush();
  fail = true;
  await h.engine.getSuggestions(FAMILY, kho(["Trứng", "Cà chua"]));
  await h.flush();
  const result = await h.engine.getSuggestions(FAMILY, kho(["Trứng", "Cà chua"]));
  assert.equal(result.status, "error");
  assert.deepEqual(result.dishes.map((entry) => entry.name), ["Món tốt"]);
  assert.equal(h.activeTimers().length, 0);
  assert.equal(h.calls.length, 2);
  assert.ok(h.logs.length > 0 && h.logs.every((line) => !line.includes(KEY)));

  // Real client path: a network error mentioning the key is logged without it.
  const captured: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { captured.push(args.map(String).join(" ")); };
  try {
    const throwing = (async () => { throw new Error(`boom ${KEY}`); }) as unknown as typeof fetch;
    const real = new AiSuggestionEngine({
      client: { aiSuggestion: { findUnique: async () => null, upsert: async () => ({}) } } as unknown as PrismaClient,
      config: () => config,
      generate: (snap, conf, prefix) => generateDishes(snap, conf, prefix, throwing),
    });
    const snap = khoSnapshot(kho(["Trứng"]), vnDay());
    await real.run(FAMILY, snap, snapshotHash(snap));
  } finally {
    console.error = original;
  }
  assert.ok(captured.length > 0);
  assert.ok(captured.every((line) => !line.includes(KEY)));
});
