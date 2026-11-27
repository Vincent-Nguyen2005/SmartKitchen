import "express-async-errors";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  masterIngredient: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  auditLog: { create: vi.fn(async () => ({})) },
  $transaction: vi.fn(),
}));
const syncMock = vi.hoisted(() => vi.fn(async () => "synced"));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../lib/promotion-sync", async (importActual) => ({ ...(await importActual<typeof import("../lib/promotion-sync")>()), promotionSync: { sync: syncMock } }));

import catalogImageRouter from "./catalog-image.route";
import { ADMIN_UPLOAD_CREDIT, setImageProcessor } from "../lib/catalog-image";
import { errorHandler } from "../middleware/error-handler";
import { promotionPayload } from "../lib/promotion-sync";

const dir = mkdtempSync(path.join(tmpdir(), "catalog-images-"));
process.env.ADMIN_UPLOAD_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const app = express().use(catalogImageRouter).use(errorHandler);
const admin = (test: request.Test) => test.set("x-user-id", "admin-1").set("x-user-role", "ADMIN");
const user = (test: request.Test) => test.set("x-user-id", "user-1").set("x-user-role", "USER");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const ingredient = (overrides: Record<string, unknown> = {}) => ({ id: "i1", name: "Cà chua", isActive: true, imageUrl: null, discountPercent: null, promoEndDate: null, promoStartDate: null, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  setImageProcessor(async (input) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), input.subarray(0, 10)]));
  prismaMock.$transaction.mockImplementation(async (run: (tx: typeof prismaMock) => unknown) => run(prismaMock));
  prismaMock.masterIngredient.findUnique.mockResolvedValue(ingredient());
  prismaMock.masterIngredient.update.mockImplementation(async ({ data }: { data: object }) => ({ ...ingredient(), ...data }));
});

describe("POST /ingredients/:id/image (Chụp ảnh)", () => {
  it("authorization: no identity 401, USER 403; nothing stored", async () => {
    expect((await request(app).post("/ingredients/i1/image").attach("photo", JPEG, { filename: "a.jpg", contentType: "image/jpeg" })).status).toBe(401);
    expect((await user(request(app).post("/ingredients/i1/image")).attach("photo", JPEG, { filename: "a.jpg", contentType: "image/jpeg" })).status).toBe(403);
    expect(prismaMock.masterIngredient.update).not.toHaveBeenCalled();
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it("validation: multipart only, one file, JPEG/PNG/WebP by magic bytes, ≤ 5 MB; unknown ingredient 404", async () => {
    expect((await admin(request(app).post("/ingredients/i1/image")).send({ photo: "x" })).body.error).toBe("INVALID_UPLOAD");
    expect((await admin(request(app).post("/ingredients/i1/image")).attach("photo", Buffer.from("not an image"), { filename: "a.jpg", contentType: "image/jpeg" })).body.error).toBe("UNSUPPORTED_PHOTO_TYPE");
    expect((await admin(request(app).post("/ingredients/i1/image")).attach("photo", JPEG, { filename: "a.gif", contentType: "image/gif" })).body.error).toBe("UNSUPPORTED_PHOTO_TYPE");
    const big = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);
    expect((await admin(request(app).post("/ingredients/i1/image")).attach("photo", big, { filename: "a.jpg", contentType: "image/jpeg" })).status).toBe(413);
    prismaMock.masterIngredient.findUnique.mockResolvedValueOnce(null);
    expect((await admin(request(app).post("/ingredients/zz/image")).attach("photo", JPEG, { filename: "a.jpg", contentType: "image/jpeg" })).status).toBe(404);
    expect(prismaMock.masterIngredient.update).not.toHaveBeenCalled();
  });

  it("stores the re-encoded JPEG, sets it with the admin credit, audits it, and removes the replaced upload", async () => {
    const response = await admin(request(app).post("/ingredients/i1/image")).attach("photo", JPEG, { filename: "a.jpg", contentType: "image/jpeg" });
    expect(response.status).toBe(200);
    const url = response.body.ingredient.imageUrl as string;
    expect(url).toMatch(/^\/api\/admin\/catalog\/images\/[a-f0-9]{32}\.jpg$/);
    expect(prismaMock.masterIngredient.update.mock.calls[0][0].data).toEqual({ imageUrl: url, imageSource: null, imageAuthor: ADMIN_UPLOAD_CREDIT, imageLicense: null });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ adminUserId: "admin-1", action: "SET_IMAGE", targetType: "MasterIngredient", targetId: "i1" }) });
    expect(readdirSync(dir)).toEqual([url.split("/").pop()]);
    // Replacing: the new file stays, the old one is removed; pasted https links are never touched.
    prismaMock.masterIngredient.findUnique.mockResolvedValueOnce(ingredient({ imageUrl: url }));
    const second = await admin(request(app).post("/ingredients/i1/image")).attach("photo", JPEG, { filename: "b.png", contentType: "image/jpeg" });
    expect(second.body.replaced).toBe(true);
    expect(readdirSync(dir)).toEqual([second.body.ingredient.imageUrl.split("/").pop()]);
  });

  it("a discounted product's Thông báo promotion is re-synced without the gateway image (https links only)", async () => {
    prismaMock.masterIngredient.findUnique.mockResolvedValueOnce(ingredient({ discountPercent: 20 }));
    prismaMock.masterIngredient.update.mockImplementationOnce(async ({ data }: { data: object }) => ({ ...ingredient({ discountPercent: 20 }), ...data }));
    await admin(request(app).post("/ingredients/i1/image")).attach("photo", JPEG, { filename: "a.jpg", contentType: "image/jpeg" });
    expect(syncMock).toHaveBeenCalledTimes(1);
    const payload = promotionPayload({ id: "i1", name: "Cà chua", isActive: true, discountPercent: 20, promoEndDate: null, imageUrl: "/api/admin/catalog/images/" + "a".repeat(32) + ".jpg" }, new Date());
    expect(payload.imageUrl).toBeNull();
    expect(promotionPayload({ id: "i1", name: "Cà chua", isActive: true, discountPercent: 20, promoEndDate: null, imageUrl: "https://cdn.example.com/a.jpg" }, new Date()).imageUrl).toBe("https://cdn.example.com/a.jpg");
  });
});

describe("GET /catalog/images/:file", () => {
  it("any signed-in user gets an image a product uses; unknown / unused / bad names 404; no identity 401", async () => {
    const name = "b".repeat(32) + ".jpg";
    writeFileSync(path.join(dir, name), JPEG);
    prismaMock.masterIngredient.count.mockResolvedValueOnce(1);
    const served = await user(request(app).get(`/catalog/images/${name}`));
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toMatch(/image\/jpeg/);
    prismaMock.masterIngredient.count.mockResolvedValueOnce(0);
    expect((await user(request(app).get(`/catalog/images/${name}`))).status).toBe(404);
    expect((await user(request(app).get("/catalog/images/..%2F..%2Fetc%2Fpasswd"))).status).toBe(404);
    expect((await request(app).get(`/catalog/images/${name}`)).status).toBe(401);
  });
});
