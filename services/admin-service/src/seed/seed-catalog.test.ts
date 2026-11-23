import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../../node_modules/.prisma/client-admin";
import { catalogSeed } from "./catalog.data";
import { seedMissingIngredients } from "./seed-catalog";

describe("starter catalog seed", () => {
  it("covers the market groups with shared unit codes, no prices and no duplicate names", () => {
    const groups = new Set(catalogSeed.map((entry) => entry.group));
    expect([...groups].sort()).toEqual(["Gia vị", "Hải sản", "Rau củ", "Thịt", "Trái cây", "Trứng & sữa", "Đồ khô & gạo", "Đồ uống", "Đồ đông lạnh"].sort());
    expect(new Set(catalogSeed.map((entry) => entry.name)).size).toBe(catalogSeed.length);
    expect(catalogSeed.length).toBeGreaterThanOrEqual(80);
    expect(catalogSeed.every((entry) => ["GRAM", "KILOGRAM", "MILLILITER", "LITER", "PIECE", "PACK", "BOTTLE", "CAN", "BOX"].includes(entry.unit))).toBe(true);
  });

  it("adds only missing names (accent-insensitive), never updates; a second run adds nothing", async () => {
    const rows: Array<Record<string, unknown>> = [{ name: "cà chua", category: "common", defaultUnit: "g" }];
    const client = {
      masterIngredient: {
        findMany: async () => rows.map((row) => ({ name: row.name })),
        createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { rows.push(...data); return { count: data.length }; },
      },
      auditLog: { findMany: async () => [] },
    } as unknown as PrismaClient;
    const added = await seedMissingIngredients(client);
    expect(added).toBe(catalogSeed.length - 1);
    expect(rows[0]).toEqual({ name: "cà chua", category: "common", defaultUnit: "g" });
    const created = rows.find((row) => row.name === "Thịt bò")!;
    expect(created).toMatchObject({ category: "Thịt", defaultUnit: "GRAM", shelfLifeDays: 3, caloriesPer100g: 250, nameNormalized: "thit bo" });
    expect(created.price).toBeUndefined();
    expect(await seedMissingIngredients(client)).toBe(0);
  });

  it("does not bring back a starter ingredient an admin deleted or renamed (audit rows)", async () => {
    const rows: Array<Record<string, unknown>> = [];
    const client = {
      masterIngredient: {
        findMany: async () => rows.map((row) => ({ name: row.name })),
        createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { rows.push(...data); return { count: data.length }; },
      },
      auditLog: { findMany: async () => [
        { action: "DELETE", metadata: { before: { name: "Thịt bò" } } },
        { action: "UPDATE", metadata: { before: { name: "Chả giò" }, after: { name: "Mướng ngọt" } } },
        // An edit that keeps the name (or only changes accents/case) does not remove it.
        { action: "UPDATE", metadata: { before: { name: "Cà chua" }, after: { name: "cà chua" } } },
        { action: "DELETE", metadata: null },
      ] },
    } as unknown as PrismaClient;
    expect(await seedMissingIngredients(client)).toBe(catalogSeed.length - 2);
    expect(rows.some((row) => row.name === "Thịt bò" || row.name === "Chả giò")).toBe(false);
    expect(rows.some((row) => row.name === "Cà chua")).toBe(true);
  });

  it("no longer lists Nước suối", () => {
    expect(catalogSeed.some((entry) => entry.name === "Nước suối")).toBe(false);
  });

  it("uses real kcal per 100 g for the staples (no 50 kcal placeholder)", () => {
    const kcal = Object.fromEntries(catalogSeed.map((entry) => [entry.name, entry.kcal]));
    expect(kcal).toMatchObject({ "Gạo": 360, "Thịt bò": 250, "Thịt heo": 242, "Thịt gà": 215, "Trứng gà": 143, "Tôm": 99, "Cá basa": 90, "Đậu phụ": 76, "Lạc": 567, "Đậu xanh": 347, "Sữa tươi": 62, "Sữa chua": 61, "Chuối": 89, "Cam": 47, "Cà chua": 18, "Cà rốt": 41, "Bắp cải": 25, "Rau muống": 19 });
  });
});
