import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  foodItem: { findFirst: vi.fn(), update: vi.fn() },
  inventoryLog: { create: vi.fn() },
  category: { upsert: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({ $transaction: vi.fn(), foodItem: { create: vi.fn() } }));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("./photo-storage.service", () => ({ PhotoStorage: { removeByUrl: vi.fn() }, managedPhotoFileName: () => null }));

import { normalizeUnitLabel } from "../lib/unit-label";
import { ItemsService } from "./items.service";
import { createItemSchema } from "../validators/items.validator";

const familyId = "11111111-1111-4111-8111-111111111111";
const userId = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.resetAllMocks();
  prismaMock.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
  prismaMock.foodItem.create.mockImplementation(async ({ data }: { data: object }) => data);
  tx.foodItem.update.mockImplementation(async ({ data }: { data: object }) => data);
  tx.inventoryLog.create.mockResolvedValue({});
});

describe("Kho unit words (unitLabel)", () => {
  it("keeps a specific word only for PIECE rows; 'cái' and other units store null", () => {
    expect(normalizeUnitLabel("PIECE", "quả")).toBe("quả");
    expect(normalizeUnitLabel("PIECE", " Bìa ")).toBe("bìa");
    expect(normalizeUnitLabel("PIECE", "cái")).toBeNull();
    expect(normalizeUnitLabel("PIECE", null)).toBeNull();
    expect(normalizeUnitLabel("PACK", "quả")).toBeNull();
    expect(normalizeUnitLabel("PIECE", "gói")).toBeNull();
  });

  it("the API accepts only the agreed piece words", () => {
    const base = { familyId, name: "Táo", quantity: 2, unit: "PIECE" as const };
    expect(createItemSchema.parse({ ...base, unitLabel: "quả" }).unitLabel).toBe("quả");
    expect(() => createItemSchema.parse({ ...base, unitLabel: "cái/quả" })).toThrow();
  });

  it("a new row takes the client's word, else the linked catalog product's word", async () => {
    const created = await ItemsService.create(createItemSchema.parse({ familyId, name: "Táo", quantity: 2, unit: "PIECE" }), "p-apple", "quả");
    expect(created).toMatchObject({ unit: "PIECE", unitLabel: "quả", productId: "p-apple" });
    const chosen = await ItemsService.create(createItemSchema.parse({ familyId, name: "Táo", quantity: 2, unit: "PIECE", unitLabel: "trái" }), "p-apple", "quả");
    expect(chosen).toMatchObject({ unitLabel: "trái" });
    const pack = await ItemsService.create(createItemSchema.parse({ familyId, name: "Mì", quantity: 1, unit: "PACK" }), "p-noodles", "quả");
    expect(pack).toMatchObject({ unitLabel: null });
  });

  it("an edit keeps the word with the unit: changing away from PIECE clears it, picking a word sets it", async () => {
    tx.foodItem.findFirst.mockResolvedValue({ id: "i1", familyId, origin: "MANUAL", name: "Táo", unit: "PIECE", unitLabel: "quả", quantity: 2, status: "FRESH", imageUrl: null });
    expect(await ItemsService.update("i1", familyId, { unit: "KILOGRAM" }, userId)).toMatchObject({ unit: "KILOGRAM", unitLabel: null });
    expect(await ItemsService.update("i1", familyId, { unitLabel: "trái" }, userId)).toMatchObject({ unitLabel: "trái" });
    expect(await ItemsService.update("i1", familyId, { quantity: 3 }, userId)).not.toHaveProperty("unitLabel");
  });
});
