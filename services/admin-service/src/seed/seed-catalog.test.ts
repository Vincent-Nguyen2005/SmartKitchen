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
    expect(created).toMatchObject({ category: "Thịt", defaultUnit: "KILOGRAM", shelfLifeDays: 3, caloriesPer100g: 250, nameNormalized: "thit bo" });
    expect(created.price).toBe(300000); // per kg
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

  it("never creates a retired starter name (Rau sống is a mixed plate, not one ingredient), even if listed again", async () => {
    expect(catalogSeed.some((entry) => entry.name === "Rau sống")).toBe(false);
    expect(catalogDetails["Rau sống"]).toBeUndefined();
    const rows: Array<Record<string, unknown>> = [];
    const client = {
      masterIngredient: { findMany: async () => [], createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { rows.push(...data); return { count: data.length }; } },
      auditLog: { findMany: async () => [] },
    } as unknown as PrismaClient;
    const again = [{ name: "Rau SỐNG", en: "mixed raw vegetables", group: "Rau củ", unit: "PACK" as const, shelfLifeDays: 2, kcal: 18 }, { name: "Xà lách", en: "lettuce", group: "Rau củ", unit: "KILOGRAM" as const, shelfLifeDays: 5, kcal: 15 }];
    expect(await seedMissingIngredients(client, again)).toBe(1);
    expect(rows.map((row) => row.name)).toEqual(["Xà lách"]);
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

  it("nothing is sold by the gram: kg products are priced per kg, small aromatics per pack with a pack weight", async () => {
    const rows: Array<Record<string, unknown>> = [];
    const client = {
      masterIngredient: { findMany: async () => [], createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { rows.push(...data); return { count: data.length }; } },
      auditLog: { findMany: async () => [] },
    } as unknown as PrismaClient;
    await seedMissingIngredients(client);
    expect(rows.filter((row) => row.defaultUnit === "GRAM").map((row) => row.name)).toEqual([]);
    expect(rows.find((row) => row.name === "Thịt ba chỉ")).toMatchObject({ defaultUnit: "KILOGRAM", price: 170000, packGrams: null, caloriesPer100g: 350 });
    expect(rows.find((row) => row.name === "Hành lá")).toMatchObject({ defaultUnit: "PACK", price: 5000, packGrams: 100 });
    expect(rows.find((row) => row.name === "Cà chua")).toMatchObject({ defaultUnit: "KILOGRAM", price: 30000 });
    // Every weight per unit belongs to a pack or piece-type product (never kg).
    for (const row of rows.filter((entry) => entry.packGrams !== null)) expect(["PACK", "PIECE", "BOTTLE", "CAN", "BOX"], String(row.name)).toContain(row.defaultUnit);
  });

  it("piece products (cái / quả, chai, lon, hộp) have a weight per unit; PIECE ones a specific word", async () => {
    const rows: Array<Record<string, unknown>> = [];
    const client = {
      masterIngredient: { findMany: async () => [], createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { rows.push(...data); return { count: data.length }; } },
      auditLog: { findMany: async () => [] },
    } as unknown as PrismaClient;
    await seedMissingIngredients(client);
    const pieces = rows.filter((row) => ["PIECE", "BOTTLE", "CAN", "BOX"].includes(String(row.defaultUnit)));
    expect(pieces.filter((row) => !(Number(row.packGrams) > 0)).map((row) => row.name)).toEqual([]);
    expect(pieces.filter((row) => row.defaultUnit === "PIECE" && !row.unitLabel).map((row) => row.name)).toEqual([]);
    expect(rows.filter((row) => row.unitLabel && !["cái", "quả", "trái", "chai", "lon", "hộp", "nải", "bìa"].includes(String(row.unitLabel)))).toEqual([]);
    expect(rows.find((row) => row.name === "Bưởi")).toMatchObject({ defaultUnit: "PIECE", unitLabel: "quả", packGrams: 1200 });
    expect(rows.find((row) => row.name === "Đậu phụ")).toMatchObject({ unitLabel: "bìa", packGrams: 200 });
    expect(rows.find((row) => row.name === "Nước mắm")).toMatchObject({ defaultUnit: "BOTTLE", unitLabel: null, packGrams: 500 });
  });

  it("every starter product has a market price (whole VND, 500 VND steps) and macros that fit its kcal", () => {
    for (const entry of catalogSeed) {
      const detail = catalogDetails[entry.name];
      expect(detail, entry.name).toBeDefined();
      expect(Number.isInteger(detail.price) && detail.price > 0, entry.name).toBe(true);
      expect(detail.price % 500, entry.name).toBe(0);
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
