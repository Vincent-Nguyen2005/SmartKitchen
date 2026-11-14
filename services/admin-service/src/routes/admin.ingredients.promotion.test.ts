import "express-async-errors";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  masterIngredient: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
const syncMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../lib/promotion-sync", async (importActual) => ({
  ...(await importActual<typeof import("../lib/promotion-sync")>()),
  promotionSync: { sync: syncMock },
}));

import adminRouter from "./admin.route";
import { errorHandler } from "../middleware/error-handler";
import { addDays, vnToday } from "../lib/promotion-sync";

const app = express();
app.use(express.json());
app.use(adminRouter);
app.use(errorHandler);
const admin = (req: request.Test) => req.set("x-user-id", "admin-1").set("x-user-role", "ADMIN");
const base = { name: "Cà chua", category: "vegetable", defaultUnit: "g", allergenTags: [] };
const stored = { id: "i1", ...base, nameNormalized: "ca chua", isActive: true, imageUrl: null, discountPercent: null, promoEndDate: null };
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => typeof arg === "function" ? (arg as (tx: typeof prismaMock) => unknown)(prismaMock) : Promise.all(arg as unknown[]));
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.masterIngredient.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "i1", isActive: true, ...data }));
  prismaMock.masterIngredient.update.mockImplementation(async ({ data }: { data: object }) => ({ ...stored, ...(await prismaMock.masterIngredient.findUnique.mock.results[0]?.value), ...data }));
  syncMock.mockResolvedValue("synced");
});

describe("ingredient promotion fields", () => {
  it("creates with a discount and publishes the promotion (default end date today + 7)", async () => {
    const response = await admin(request(app).post("/ingredients")).send({ ...base, imageUrl: "https://cdn.example.com/a.jpg", discountPercent: 20 });
    expect(response.status).toBe(201);
    expect(response.body.promotionSync).toBe("synced");
    const data = prismaMock.masterIngredient.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ imageUrl: "https://cdn.example.com/a.jpg", discountPercent: 20 });
    expect(data.promoEndDate.toISOString().slice(0, 10)).toBe(addDays(vnToday(), 7));
    expect(syncMock).toHaveBeenCalledWith(expect.objectContaining({ id: "i1", discountPercent: 20 }), false);
  });

  it("keeps an explicit end date and creates without a promotion when no discount is given", async () => {
    const endDay = addDays(vnToday(), 3);
    await admin(request(app).post("/ingredients")).send({ ...base, discountPercent: 15, promoEndDate: endDay });
    expect(prismaMock.masterIngredient.create.mock.calls[0][0].data.promoEndDate).toEqual(day(endDay));
    await admin(request(app).post("/ingredients")).send({ ...base, promoEndDate: endDay });
    expect(prismaMock.masterIngredient.create.mock.calls[1][0].data).toMatchObject({ discountPercent: null, promoEndDate: null });
  });

  it("updates the discount and re-syncs the existing promotion", async () => {
    prismaMock.masterIngredient.findUnique.mockResolvedValue({ ...stored, discountPercent: 10, promoEndDate: day(addDays(vnToday(), 5)) });
    const response = await admin(request(app).put("/ingredients/i1")).send({ discountPercent: 30 });
    expect(response.status).toBe(200);
    const data = prismaMock.masterIngredient.update.mock.calls[0][0].data;
    expect(data.discountPercent).toBe(30);
    expect(data.promoEndDate).toEqual(day(addDays(vnToday(), 5))); // stored end date kept
    expect(syncMock).toHaveBeenCalledWith(expect.objectContaining({ discountPercent: 30 }), true);
  });

  it("clearing the discount clears the end date and deactivates the promotion", async () => {
    prismaMock.masterIngredient.findUnique.mockResolvedValue({ ...stored, discountPercent: 10, promoEndDate: day(addDays(vnToday(), 5)) });
    await admin(request(app).put("/ingredients/i1")).send({ discountPercent: null });
    expect(prismaMock.masterIngredient.update.mock.calls[0][0].data).toMatchObject({ discountPercent: null, promoEndDate: null });
    expect(syncMock).toHaveBeenCalledWith(expect.objectContaining({ discountPercent: null }), true);
  });

  it("hiding a discounted ingredient deactivates its promotion", async () => {
    prismaMock.masterIngredient.findUnique.mockResolvedValue({ ...stored, discountPercent: 10 });
    const response = await admin(request(app).patch("/ingredients/i1/active")).send({ isActive: false });
    expect(response.status).toBe(200);
    expect(syncMock).toHaveBeenCalledWith(expect.objectContaining({ isActive: false, discountPercent: 10 }), true);
  });

  it.each([0, 101, 1.5, "abc", -5])("rejects discountPercent %s", async (discountPercent) => {
    expect((await admin(request(app).post("/ingredients")).send({ ...base, discountPercent })).status).toBe(400);
    expect(prismaMock.masterIngredient.create).not.toHaveBeenCalled();
    expect(syncMock).not.toHaveBeenCalled();
  });

  it.each([
    "http://cdn.example.com/a.jpg", "javascript:alert(1)", "data:image/png;base64,AAAA", "file:///etc/passwd",
    "https://localhost/a.jpg", "https://10.0.0.1/a.jpg", `https://cdn.example.com/${"a".repeat(2050)}`,
  ])("rejects imageUrl %s", async (imageUrl) => {
    expect((await admin(request(app).post("/ingredients")).send({ ...base, imageUrl })).status).toBe(400);
    expect(prismaMock.masterIngredient.create).not.toHaveBeenCalled();
  });

  it("rejects an end date in the past or that is not a date", async () => {
    for (const promoEndDate of [addDays(vnToday(), -1), "2026-02-30", "30/11/2026"]) {
      expect((await admin(request(app).post("/ingredients")).send({ ...base, discountPercent: 10, promoEndDate })).status).toBe(400);
    }
  });

  it("treats empty strings from the form as no image / no discount", async () => {
    await admin(request(app).post("/ingredients")).send({ ...base, imageUrl: "", discountPercent: "", promoEndDate: "" });
    expect(prismaMock.masterIngredient.create.mock.calls[0][0].data).toMatchObject({ imageUrl: null, discountPercent: null, promoEndDate: null });
  });

  it("still saves the ingredient and reports promotionSync failed when the sync fails", async () => {
    syncMock.mockResolvedValue("failed");
    const response = await admin(request(app).post("/ingredients")).send({ ...base, discountPercent: 20 });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ id: "i1", promotionSync: "failed" });
    expect(prismaMock.masterIngredient.create).toHaveBeenCalledTimes(1);
  });
});
