import "express-async-errors";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  masterIngredient: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

import adminRouter from "./admin.route";

const app = express().use(express.json()).use(adminRouter);
const admin = (test: request.Test) => test.set("x-user-id", "admin-1").set("x-user-role", "ADMIN");
const credit = { imageSource: "https://commons.wikimedia.org/wiki/File:Tomato.jpg", imageAuthor: "Jane", imageLicense: "CC BY-SA 4.0" };
const stored = { id: "i1", name: "Cà chua", category: "Rau củ", defaultUnit: "KILOGRAM", imageUrl: "https://upload.wikimedia.org/a/500px-Tomato.jpg", ...credit, discountPercent: null, promoEndDate: null, price: null, isActive: true };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof prismaMock) => unknown)(prismaMock)));
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.masterIngredient.findUnique.mockResolvedValue(stored);
  prismaMock.masterIngredient.update.mockImplementation(async ({ data }: { data: object }) => ({ ...stored, ...data }));
});

const updateData = () => prismaMock.masterIngredient.update.mock.calls[0][0].data;

describe("image credit", () => {
  it("a new image link from the admin drops the old Commons credit", async () => {
    const response = await admin(request(app).put("/ingredients/i1")).send({ imageUrl: "https://cdn.example.com/my-photo.jpg" });
    expect(response.status).toBe(200);
    expect(updateData()).toMatchObject({ imageUrl: "https://cdn.example.com/my-photo.jpg", imageSource: null, imageAuthor: null, imageLicense: null });
  });

  it("editing other fields keeps the image and its credit", async () => {
    await admin(request(app).put("/ingredients/i1")).send({ shelfLifeDays: 9 });
    expect(updateData().imageSource).toBeUndefined();
    expect(updateData().imageUrl).toBe(stored.imageUrl);
  });

  it("the catalog returns the credit for the product sheet", async () => {
    prismaMock.masterIngredient.findMany.mockImplementation(async (args: { distinct?: string[] }) => (args.distinct ? [{ category: "Rau củ" }] : [stored]));
    prismaMock.masterIngredient.count.mockResolvedValue(1);
    const response = await request(app).get("/catalog/ingredients").set("x-user-id", "u1").set("x-user-role", "USER");
    expect(response.body.items[0]).toMatchObject({ imageUrl: stored.imageUrl, ...credit });
  });
});
