import "express-async-errors";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  masterIngredient: { findMany: vi.fn() },
  recipeImage: { findUnique: vi.fn(), create: vi.fn(async ({ data }: { data: object }) => data), delete: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({ count: 1 })) },
  auditLog: { create: vi.fn(async () => ({})) },
  $transaction: vi.fn(),
}));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

import aiSuggestRouter, { setAiTestHooks } from "./ai-suggest.route";
import recipeImageRouter, { recipeService } from "./recipe-image.route";
import { setImageProcessor } from "../lib/catalog-image";
import { errorHandler } from "../middleware/error-handler";

const dir = mkdtempSync(path.join(tmpdir(), "recipe-images-"));
process.env.ADMIN_UPLOAD_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const app = express().use(aiSuggestRouter).use(recipeImageRouter).use(errorHandler);
const admin = (test: request.Test) => test.set("x-user-id", "admin-1").set("x-user-role", "ADMIN");
const user = (test: request.Test) => test.set("x-user-id", "user-1").set("x-user-role", "USER");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const photo = (test: request.Test) => test.attach("photo", JPEG, { filename: "a.jpg", contentType: "image/jpeg" });
const caller = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  setImageProcessor(async (input) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), input.subarray(0, 10)]));
  setAiTestHooks({ caller, limit: 3 });
  prismaMock.$transaction.mockImplementation(async (run: (tx: typeof prismaMock) => unknown) => run(prismaMock));
  prismaMock.masterIngredient.findMany.mockImplementation(async (args: { distinct?: string[] }) => (args?.distinct ? [{ category: "Rau củ" }, { category: "Thịt" }] : [{ name: "Thịt bò", englishName: "beef" }]));
  caller.mockResolvedValue({ name: "Cà chua", category: "rau củ", defaultUnit: "KILOGRAM", price: 25_000, confidence: 0.9 });
});

describe("POST /ai/suggest", () => {
  it("authorization: no identity 401, USER 403; Gemini is not called", async () => {
    expect((await photo(request(app).post("/ai/suggest?kind=ingredient"))).status).toBe(401);
    expect((await photo(user(request(app).post("/ai/suggest?kind=ingredient")))).status).toBe(403);
    expect(caller).not.toHaveBeenCalled();
  });

  it("ingredient: validated suggestion with the catalog's groups; the photo is not stored", async () => {
    const response = await photo(admin(request(app).post("/ai/suggest?kind=ingredient")));
    expect(response.status).toBe(200);
    expect(response.body.suggestion).toMatchObject({ name: "Cà chua", category: "Rau củ", defaultUnit: "KILOGRAM", price: 25_000, confidence: 0.9 });
    expect(caller.mock.calls[0][1]).toBe("image/jpeg");
    expect(String(caller.mock.calls[0][2])).toContain("Rau củ; Thịt");
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it("recipe: ingredients mapped to the catalog", async () => {
    caller.mockResolvedValueOnce({ name: "Bò xào", ingredients: [{ name: "beef", quantity: 300, unit: "GRAM" }, { name: "Sả", quantity: 2, unit: "PIECE" }] });
    const response = await photo(admin(request(app).post("/ai/suggest?kind=recipe")));
    expect(response.body.suggestion).toMatchObject({ name: "Bò xào", ingredients: [{ name: "Thịt bò", quantity: 300, unit: "GRAM" }], unmatched: ["Sả"] });
  });

  it("daily limit per admin (429 after the limit); bad kind 400; bad file does not use a call", async () => {
    expect((await admin(request(app).post("/ai/suggest?kind=dish")).attach("photo", JPEG, { filename: "a.jpg", contentType: "image/jpeg" })).status).toBe(400);
    expect((await admin(request(app).post("/ai/suggest?kind=ingredient")).attach("photo", Buffer.from("nope"), { filename: "a.jpg", contentType: "image/jpeg" })).status).toBe(400);
    for (let index = 0; index < 3; index += 1) expect((await photo(admin(request(app).post("/ai/suggest?kind=ingredient")))).status).toBe(200);
    const limited = await photo(admin(request(app).post("/ai/suggest?kind=ingredient")));
    expect([limited.status, limited.body.error]).toEqual([429, "AI_LIMIT"]);
  });

  it("Gemini failing → 502 AI_FAILED; not configured → 503 AI_OFF (the app opens the empty form)", async () => {
    caller.mockRejectedValueOnce(new Error("timeout"));
    expect((await photo(admin(request(app).post("/ai/suggest?kind=ingredient")))).body.error).toBe("AI_FAILED");
    setAiTestHooks({ caller: null });
    delete process.env.GEMINI_API_KEY;
    expect((await photo(admin(request(app).post("/ai/suggest?kind=ingredient")))).body.error).toBe("AI_OFF");
  });
});

describe("dish images (POST /recipes/:id/image, GET /recipe-images/:file)", () => {
  it("authorization: no identity 401, USER 403", async () => {
    expect((await photo(request(app).post("/recipes/r1/image"))).status).toBe(401);
    expect((await photo(user(request(app).post("/recipes/r1/image")))).status).toBe(403);
  });

  it("same upload rules as catalog images: type / magic bytes / 5 MB; unknown recipe 404", async () => {
    vi.spyOn(recipeService, "get").mockResolvedValue({ id: "r1", name: "Phở bò", imageUrl: null });
    expect((await admin(request(app).post("/recipes/r1/image")).attach("photo", Buffer.from("x"), { filename: "a.jpg", contentType: "image/jpeg" })).body.error).toBe("UNSUPPORTED_PHOTO_TYPE");
    expect((await admin(request(app).post("/recipes/r1/image")).attach("photo", Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]), { filename: "a.jpg", contentType: "image/jpeg" })).status).toBe(413);
    vi.spyOn(recipeService, "get").mockResolvedValueOnce(null);
    expect((await photo(admin(request(app).post("/recipes/zz/image")))).status).toBe(404);
  });

  it("stores the re-encoded image, sets the recipe's imageUrl through recipe-service, audits, removes the replaced file", async () => {
    vi.spyOn(recipeService, "get").mockResolvedValue({ id: "r1", name: "Phở bò", imageUrl: null });
    const setImage = vi.spyOn(recipeService, "setImage").mockImplementation(async (id, imageUrl) => ({ id, name: "Phở bò", imageUrl }));
    prismaMock.recipeImage.findUnique.mockResolvedValueOnce(null);
    const first = await photo(admin(request(app).post("/recipes/r1/image")));
    expect(first.status).toBe(200);
    const url = first.body.recipe.imageUrl as string;
    expect(url).toMatch(/^\/api\/admin\/recipe-images\/[a-f0-9]{32}\.jpg$/);
    expect(setImage).toHaveBeenCalledWith("r1", url, "admin-1");
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "SET_IMAGE", targetType: "Recipe", targetId: "r1" }) });
    const firstFile = url.split("/").pop() as string;
    expect(readdirSync(dir)).toEqual([firstFile]);
    prismaMock.recipeImage.findUnique.mockResolvedValueOnce({ fileName: firstFile, recipeId: "r1" });
    vi.spyOn(recipeService, "get").mockResolvedValue({ id: "r1", name: "Phở bò", imageUrl: url });
    const second = await photo(admin(request(app).post("/recipes/r1/image")));
    expect(second.body.replaced).toBe(true);
    expect(readdirSync(dir)).toEqual([second.body.recipe.imageUrl.split("/").pop()]);
  });

  it("serves only files a recipe uses; signed-in users only", async () => {
    prismaMock.recipeImage.findUnique.mockResolvedValueOnce(null);
    expect((await user(request(app).get(`/recipe-images/${"c".repeat(32)}.jpg`))).status).toBe(404);
    expect((await request(app).get(`/recipe-images/${"c".repeat(32)}.jpg`)).status).toBe(401);
  });
});
