import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../../node_modules/.prisma/client-admin";
import { catalogMacros, catalogSeed } from "./catalog.data";
import { catalogDetails } from "./catalog-details";
import { seedMissingIngredients } from "./seed-catalog";

describe("starter catalog seed", () => {
  it("covers the market groups (fixed list) with shared unit codes and no duplicate names", () => {
    const groups = new Set(catalogSeed.map((entry) => entry.group));
    expect([...groups].sort()).toEqual(["Gia vị", "Hải sản", "Khác", "Rau củ", "Thịt", "Trái cây", "Trứng & sữa", "Đồ khô & gạo", "Đồ uống", "Đồ đông lạnh"].sort());
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
    expect(created.price).toBe(300); // GRAM unit: per gram (300 000 đ/kg)
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

  it("staple macros add up to their kcal within 5% and are stored on new rows", async () => {
    const kcal = Object.fromEntries(catalogSeed.map((entry) => [entry.name, entry.kcal]));
    expect(Object.keys(catalogMacros)).toHaveLength(30);
    for (const [name, [protein, carbs, fat]] of Object.entries(catalogMacros)) {
      const fromMacros = protein * 4 + carbs * 4 + fat * 9;
      expect(Math.abs(fromMacros - kcal[name]) / kcal[name], name).toBeLessThanOrEqual(0.05);
    }
    const rows: Array<Record<string, unknown>> = [];
    const client = {
      masterIngredient: { findMany: async () => [], createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { rows.push(...data); return { count: data.length }; } },
      auditLog: { findMany: async () => [] },
    } as unknown as PrismaClient;
    await seedMissingIngredients(client);
    expect(rows.find((row) => row.name === "Gạo")).toMatchObject({ proteinPer100g: 7.1, carbsPer100g: 79, fatPer100g: 0.7 });
    expect(rows.find((row) => row.name === "Kim chi")).toMatchObject({ category: "Rau củ", defaultUnit: "PACK", caloriesPer100g: 15 });
    expect(rows.find((row) => row.name === "Mì Ý")?.proteinPer100g).toBe(13); // from catalog-details
  });

  it("every starter ingredient gets an English alias for photo recognition", async () => {
    const rows: Array<Record<string, unknown>> = [];
    const client = {
      masterIngredient: { findMany: async () => [], createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { rows.push(...data); return { count: data.length }; } },
      auditLog: { findMany: async () => [] },
    } as unknown as PrismaClient;
    await seedMissingIngredients(client);
    expect(rows.every((row) => typeof row.englishName === "string" && (row.englishName as string).length > 0)).toBe(true);
    expect(rows.find((row) => row.name === "Cà rốt")?.englishName).toBe("carrot");
    expect(rows.find((row) => row.name === "Gạo")?.englishName).toBe("uncooked white rice");
    expect(rows.find((row) => row.name === "Bơ lạt")?.englishName).toBe("butter");
  });

  it("every starter product has a market price (whole VND; 500 VND steps unless priced per gram) and macros that fit its kcal", () => {
    for (const entry of catalogSeed) {
      const detail = catalogDetails[entry.name];
      expect(detail, entry.name).toBeDefined();
      expect(Number.isInteger(detail.price) && detail.price > 0, entry.name).toBe(true);
      if (entry.unit !== "GRAM") expect(detail.price % 500, entry.name).toBe(0);
      const [protein, carbs, fat] = catalogMacros[entry.name] ?? detail.macros ?? [];
      expect(protein, entry.name).toBeDefined();
      // 4 / 4 / 9 kcal per gram within 25% (vinegar's acetic acid and near-zero drinks excepted).
      if (entry.kcal >= 20 && entry.name !== "Giấm") expect(Math.abs(protein * 4 + carbs * 4 + fat * 9 - entry.kcal) / entry.kcal, entry.name).toBeLessThanOrEqual(0.25);
    }
  });

  it("new rows get price, macros and obvious allergens from catalog-details", async () => {
    const rows: Array<Record<string, unknown>> = [];
    const client = {
      masterIngredient: { findMany: async () => [], createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { rows.push(...data); return { count: data.length }; } },
      auditLog: { findMany: async () => [] },
    } as unknown as PrismaClient;
    await seedMissingIngredients(client);
    expect(rows.find((row) => row.name === "Tôm")).toMatchObject({ allergenTags: ["hải sản"] });
    expect(rows.find((row) => row.name === "Xương heo")).toMatchObject({ category: "Thịt", defaultUnit: "KILOGRAM", price: 70000, proteinPer100g: 14, englishName: "pork bones" });
    expect(rows.find((row) => row.name === "Dầu mè")).toMatchObject({ allergenTags: ["mè"], price: 55000 });
  });
});
