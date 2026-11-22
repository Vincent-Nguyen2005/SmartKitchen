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
    } as unknown as PrismaClient;
    const added = await seedMissingIngredients(client);
    expect(added).toBe(catalogSeed.length - 1);
    expect(rows[0]).toEqual({ name: "cà chua", category: "common", defaultUnit: "g" });
    const created = rows.find((row) => row.name === "Thịt bò")!;
    expect(created).toMatchObject({ category: "Thịt", defaultUnit: "GRAM", shelfLifeDays: 3, caloriesPer100g: 250, nameNormalized: "thit bo" });
    expect(created.price).toBeUndefined();
    expect(await seedMissingIngredients(client)).toBe(0);
  });
});
