import { describe, expect, it, vi } from "vitest";
import { createPhotoSuggester, type SuggestDeps } from "./suggest.service";
import { ClipUnavailableError, probabilities, normalize } from "./clip";
import { buildPrompt, createDailyLimit, createGeminiPicker } from "./gemini";
import { loadCatalogLabels, resetCatalogLabelCache } from "./catalog-labels";

const catalog = [
  { id: "c1", name: "Cà rốt", englishName: "carrot" },
  { id: "c2", name: "Cà chua", englishName: "tomato" },
  { id: "c3", name: "Khoai tây", englishName: "potato" },
  { id: "c4", name: "Rau ngót", englishName: null },
];
const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const input = { image, mimeType: "image/jpeg", userId: "u1", familyId: "f1" };

const deps = (overrides: Partial<SuggestDeps> = {}): SuggestDeps => ({
  loadCatalog: async () => catalog,
  classify: async () => [0.7, 0.2, 0.1],
  gemini: null,
  geminiAllowed: () => true,
  threshold: 0.4,
  log: () => undefined,
  ...overrides,
});

describe("photo suggestions", () => {
  it("CLIP above the threshold: up to 3 catalog names, best first, Vietnamese names returned; labels are the English aliases", async () => {
    const classify = vi.fn(async () => [0.1, 0.75, 0.15]);
    const result = await createPhotoSuggester(deps({ classify }))(input);
    expect(classify).toHaveBeenCalledWith(image, ["carrot", "tomato", "potato"]);
    expect(result).toEqual({
      confident: true, source: "clip",
      suggestions: [{ name: "Cà chua", catalogId: "c2", score: 0.75 }, { name: "Khoai tây", catalogId: "c3", score: 0.15 }, { name: "Cà rốt", catalogId: "c1", score: 0.1 }],
    });
  });

  it("CLIP unsure -> Gemini picks from the same catalog list (unknown names dropped)", async () => {
    const gemini = vi.fn(async () => ["Rau ngót", "Bánh pizza"]);
    const result = await createPhotoSuggester(deps({ classify: async () => [0.3, 0.3, 0.4 - 0.01], gemini }))(input);
    expect(gemini).toHaveBeenCalledWith(image, "image/jpeg", ["Cà rốt", "Cà chua", "Khoai tây", "Rau ngót"]);
    expect(result).toEqual({ confident: true, source: "gemini", suggestions: [{ name: "Rau ngót", catalogId: "c4", score: null }] });
  });

  it("CLIP not installed -> Gemini; no Gemini or daily limit used up -> no suggestion", async () => {
    const unavailable = async () => { throw new ClipUnavailableError("missing"); };
    expect((await createPhotoSuggester(deps({ classify: unavailable, gemini: async () => ["Cà rốt"] }))(input)).source).toBe("gemini");
    expect(await createPhotoSuggester(deps({ classify: unavailable }))(input)).toEqual({ suggestions: [], confident: false, source: null });
    const gemini = vi.fn(async () => ["Cà rốt"]);
    expect((await createPhotoSuggester(deps({ classify: async () => [0.2, 0.2, 0.2], gemini, geminiAllowed: () => false }))(input)).confident).toBe(false);
    expect(gemini).not.toHaveBeenCalled();
  });

  it("errors anywhere end in no suggestion, never an exception", async () => {
    const failing = createPhotoSuggester(deps({
      loadCatalog: async () => { throw new Error("admin down"); },
    }));
    expect(await failing(input)).toEqual({ suggestions: [], confident: false, source: null });
    const bothFail = createPhotoSuggester(deps({
      classify: async () => { throw new Error("onnx crashed"); },
      gemini: async () => { throw new Error("timeout"); },
    }));
    expect(await bothFail(input)).toEqual({ suggestions: [], confident: false, source: null });
  });

  it("daily Gemini limit per family (Vietnam day)", () => {
    let now = new Date("2026-11-30T10:00:00Z");
    const limit = createDailyLimit(2, () => now);
    expect([limit.take("f1"), limit.take("f1"), limit.take("f1"), limit.take("f2")]).toEqual([true, true, false, true]);
    now = new Date("2026-11-30T18:00:00Z"); // next day in Vietnam (01:00 +07)
    expect(limit.take("f1")).toBe(true);
  });
});

describe("Gemini picker", () => {
  it("sends the photo inline with the catalog names, strict JSON, key in the header; keeps only listed names, max 3", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "[\"Cà rốt\",\"Xyz\",\"Cà chua\",\"Khoai tây\",\"Cà rốt\"]" }] } }] })));
    const pick = createGeminiPicker({ apiKey: "k", model: "m" }, fetchImpl as unknown as typeof fetch);
    expect(await pick(image, "image/jpeg", ["Cà rốt", "Cà chua", "Khoai tây"])).toEqual(["Cà rốt", "Cà chua", "Khoai tây"]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/models/m:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[1].inline_data).toEqual({ mime_type: "image/jpeg", data: image.toString("base64") });
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(buildPrompt(["A", "B"])).toContain("A; B");
  });

  it("non-JSON or HTTP errors throw (the suggester turns them into no suggestion)", async () => {
    const bad = createGeminiPicker({ apiKey: "k", model: "m" }, (async () => new Response("{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"carrot\"}]}}]}")) as unknown as typeof fetch);
    await expect(bad(image, "image/jpeg", ["Cà rốt"])).rejects.toThrow();
    const down = createGeminiPicker({ apiKey: "k", model: "m" }, (async () => new Response("", { status: 503 })) as unknown as typeof fetch);
    await expect(down(image, "image/jpeg", ["Cà rốt"])).rejects.toThrow("503");
  });
});

describe("CLIP math and catalog labels", () => {
  it("softmax of scaled cosine similarity picks the closest label", () => {
    const img = normalize(new Float32Array([1, 0]));
    const texts = [normalize(new Float32Array([1, 0.05])), normalize(new Float32Array([0, 1]))];
    const scores = probabilities(img, texts);
    expect(scores[0]).toBeGreaterThan(0.99);
    expect(scores.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("reads every catalog page with the caller's id and caches the labels", async () => {
    resetCatalogLabelCache();
    const fetchImpl = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("page=1")
      ? { items: [{ id: "c1", name: "Cà rốt", englishName: "carrot" }], totalPages: 2 }
      : { items: [{ id: "c2", name: "Rau ngót", englishName: " " }], totalPages: 2 })));
    const labels = await loadCatalogLabels("u1", fetchImpl as unknown as typeof fetch);
    expect(labels).toEqual([{ id: "c1", name: "Cà rốt", englishName: "carrot" }, { id: "c2", name: "Rau ngót", englishName: null }]);
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toEqual({ "x-user-id": "u1" });
    await loadCatalogLabels("u1", fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    resetCatalogLabelCache();
  });
});
