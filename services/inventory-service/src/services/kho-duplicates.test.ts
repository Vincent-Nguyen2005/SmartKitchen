import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory FoodItem table: enough of Prisma's API for create / match / add-quantity / update.
type Row = { id: string; familyId: string; name: string; quantity: number; unit: string; status: string; productId: string | null; imageUrl: string | null; expiryDate: Date | null; deletedAt: Date | null; createdAt: Date; categoryId?: string | null };
const db = vi.hoisted(() => ({ rows: [] as Row[], logs: [] as Array<{ action: string }>, seq: 0 }));
const matches = (row: Row, where: Record<string, any>) => Object.entries(where).every(([key, value]) => {
  if (value && typeof value === "object" && "in" in value) return value.in.includes((row as any)[key]);
  // A field the row never had counts as null (like a NULL column).
  return ((row as any)[key] ?? null) === value;
});
const prismaMock = vi.hoisted(() => {
  const foodItem = {
    create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
      db.seq += 1;
      const row = { id: globalThis.crypto.randomUUID(), status: "FRESH", productId: null, imageUrl: null, expiryDate: null, deletedAt: null, createdAt: new Date(2026, 0, db.seq), ...data } as Row;
      db.rows.push(row);
      return { ...row, category: null };
    }),
    findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => db.rows.filter((row) => matches(row, where)).sort((a, b) => +a.createdAt - +b.createdAt).map((row) => ({ ...row, category: null }))),
    findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => { const row = db.rows.find((entry) => matches(entry, where)); return row ? { ...row, category: null } : null; }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const hit = db.rows.filter((row) => matches(row, where));
      for (const row of hit) for (const [key, value] of Object.entries(data)) (row as any)[key] = value && typeof value === "object" && "increment" in value ? (row as any)[key] + value.increment : value;
      return { count: hit.length };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
      const row = db.rows.find((entry) => entry.id === where.id) as Row;
      Object.assign(row, data);
      return { ...row, category: null };
    }),
  };
  return {
    foodItem,
    inventoryLog: { create: vi.fn(async ({ data }: { data: { action: string } }) => { db.logs.push(data); return data; }) },
    category: { upsert: vi.fn(async () => ({ id: "cat-1" })) },
    $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run({ foodItem, inventoryLog: { create: async (args: { data: { action: string } }) => { db.logs.push(args.data); return args.data; } }, category: { upsert: async () => ({ id: "cat-1" }) } })),
  };
});
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

const familyId = "11111111-1111-4111-8111-111111111111";
const otherFamilyId = "22222222-2222-4222-8222-222222222222";
vi.mock("../middleware/family-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/family-scope")>();
  return { ...actual, requireFamilyMembership: vi.fn(async (_req: unknown, requested: string) => { if (requested !== familyId) throw new actual.InventoryAccessError(403, "FAMILY_ACCESS_DENIED", "denied"); }) };
});

import { createApp } from "../app";
import { normalizeName, sameName } from "../lib/names";
import { matchCatalogProduct, setCatalogLoader } from "./catalog-match.service";

const catalog = [
  { id: "p-carrot", name: "Cà rốt", englishName: "carrot", imageUrl: "https://upload.wikimedia.org/carrot.jpg" },
  { id: "p-tomato", name: "Cà chua", englishName: "tomato", imageUrl: null },
];
const userId = "33333333-3333-4333-8333-333333333333";
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const unsigned = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: userId, exp: Math.floor(Date.now() / 1000) + 600 })}`;
const token = `${unsigned}.${createHmac("sha256", "dup-test-secret").update(unsigned).digest("base64url")}`;
let server: Server;
let base: string;
const api = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() as any };
};
const add = (name: string, unit = "KILOGRAM", quantity = 1) => api("POST", "/api/inventory/items", { familyId, name, quantity, unit, storageLocation: "PANTRY" });
const match = (name: string, unit = "KILOGRAM", family = familyId) => api("GET", `/api/inventory/items/match?familyId=${family}&name=${encodeURIComponent(name)}&unit=${unit}`);

beforeAll(async () => {
  process.env.JWT_SECRET = "dup-test-secret";
  setCatalogLoader(async () => catalog);
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
beforeEach(() => { db.rows = []; db.logs = []; db.seq = 0; });

describe("name normalization (exact, diacritics kept)", () => {
  it("case, outer and inner spaces and NFD/NFC compose equal; 'ca rot' does not", () => {
    expect(sameName("cà rốt", "Cà rốt")).toBe(true);
    expect(sameName("  CÀ  RỐT ", "Cà rốt")).toBe(true);
    expect(sameName("Cà rốt".normalize("NFD"), "Cà rốt".normalize("NFC"))).toBe(true);
    expect(sameName("ca rot", "Cà rốt")).toBe(false);
    expect(normalizeName("  CÀ  RỐT ")).toBe("cà rốt");
    expect(matchCatalogProduct("  CÀ  RỐT ", catalog)?.id).toBe("p-carrot");
    expect(matchCatalogProduct("Carrot", catalog)?.id).toBe("p-carrot"); // English alias
    expect(matchCatalogProduct("ca rot", catalog)).toBeNull();
    expect(matchCatalogProduct("cà", catalog)).toBeNull(); // no partial / fuzzy match
  });
});

describe("catalog product on create and rename (server decides)", () => {
  it("a catalog name sets productId; a name with no catalog match keeps productId null (the captured photo is then stored)", async () => {
    expect((await add("  cà RỐT ")).body.data.productId).toBe("p-carrot");
    expect((await add("Rau rừng nhà trồng")).body.data.productId).toBeNull();
  });

  it("renaming away from the catalog clears productId; renaming onto a catalog name sets it", async () => {
    const created = (await add("Cà rốt")).body.data;
    const renamed = await api("PUT", `/api/inventory/items/${created.id}?familyId=${familyId}`, { name: "Cà rốt Đà Lạt nhà vườn" });
    expect(renamed.body.data.productId).toBeNull();
    const back = await api("PUT", `/api/inventory/items/${created.id}?familyId=${familyId}`, { name: "cà chua" });
    expect(back.body.data.productId).toBe("p-tomato");
    const quantityOnly = await api("PUT", `/api/inventory/items/${created.id}?familyId=${familyId}`, { quantity: 3 });
    expect(quantityOnly.body.data.productId).toBe("p-tomato");
  });
});

describe("duplicates in the family's Kho", () => {
  it("same product and unit: match returns the existing row; 'Cộng thêm' adds quantity atomically and logs it", async () => {
    const existing = (await add("Cà rốt", "KILOGRAM", 2)).body.data;
    const found = await match("cà rốt");
    expect(found.body.data.product).toEqual({ id: "p-carrot", name: "Cà rốt", imageUrl: "https://upload.wikimedia.org/carrot.jpg" });
    expect(found.body.data.existing.id).toBe(existing.id);
    const merged = await api("POST", `/api/inventory/items/${existing.id}/add?familyId=${familyId}`, { quantity: 1.5, unit: "KILOGRAM" });
    expect(merged.status).toBe(200);
    expect(merged.body.data.quantity).toBe(3.5);
    expect(db.rows).toHaveLength(1);
    expect(db.logs.at(-1)?.action).toBe("MANUAL_MERGE");
  });

  it("merge keeps the earlier expiry (a later new date never hides it); a row without expiry takes the new one", async () => {
    const existing = (await add("Cà rốt")).body.data;
    db.rows[0].expiryDate = new Date("2026-12-10T00:00:00.000Z");
    await api("POST", `/api/inventory/items/${existing.id}/add?familyId=${familyId}`, { quantity: 1, unit: "KILOGRAM", expiryDate: "2026-12-20T00:00:00.000Z" });
    expect(db.rows[0].expiryDate?.toISOString()).toBe("2026-12-10T00:00:00.000Z");
    await api("POST", `/api/inventory/items/${existing.id}/add?familyId=${familyId}`, { quantity: 1, unit: "KILOGRAM", expiryDate: "2026-12-05T00:00:00.000Z" });
    expect(db.rows[0].expiryDate?.toISOString()).toBe("2026-12-05T00:00:00.000Z");
  });

  it("a used-up (CONSUMED) row is restocked as a fresh batch: new quantity, new expiry, status from that expiry", async () => {
    const existing = (await add("Cà rốt", "KILOGRAM", 2)).body.data;
    Object.assign(db.rows[0], { status: "CONSUMED", quantity: 0.4, expiryDate: new Date("2026-01-01T00:00:00.000Z") });
    const newExpiry = new Date(Date.now() + 20 * 86_400_000);
    newExpiry.setUTCHours(0, 0, 0, 0);
    const restocked = await api("POST", `/api/inventory/items/${existing.id}/add?familyId=${familyId}`, { quantity: 1.5, unit: "KILOGRAM", expiryDate: newExpiry.toISOString() });
    expect(restocked.status).toBe(200);
    expect(restocked.body.data.quantity).toBe(1.5); // the old 0.4 is not added
    expect(new Date(restocked.body.data.expiryDate).toISOString()).toBe(newExpiry.toISOString());
    expect(restocked.body.data.status).toBe("FRESH");
    expect(restocked.body.data.productId).toBe("p-carrot");
    expect(db.rows).toHaveLength(1);

    // Without a new expiry the stale date is cleared, not inherited.
    Object.assign(db.rows[0], { status: "CONSUMED", quantity: 0, expiryDate: new Date("2026-01-01T00:00:00.000Z") });
    const noExpiry = await api("POST", `/api/inventory/items/${existing.id}/add?familyId=${familyId}`, { quantity: 2, unit: "KILOGRAM" });
    expect(noExpiry.body.data).toMatchObject({ quantity: 2, expiryDate: null, status: "FRESH" });
  });

  it("fresh rows keep the add rule: quantity added, a row without expiry takes the new date", async () => {
    const existing = (await add("Cà rốt", "KILOGRAM", 2)).body.data;
    const newExpiry = new Date(Date.now() + 20 * 86_400_000);
    newExpiry.setUTCHours(0, 0, 0, 0);
    const merged = await api("POST", `/api/inventory/items/${existing.id}/add?familyId=${familyId}`, { quantity: 1, unit: "KILOGRAM", expiryDate: newExpiry.toISOString() });
    expect(merged.body.data).toMatchObject({ quantity: 3, status: "FRESH" });
    expect(new Date(merged.body.data.expiryDate).toISOString()).toBe(newExpiry.toISOString());
  });

  it("status from an expiry follows the alerts rule (3-day window)", async () => {
    const { statusForExpiry } = await import("./items.service");
    const now = new Date("2026-11-24T10:00:00.000Z");
    expect(statusForExpiry(null, now)).toBe("FRESH");
    expect(statusForExpiry(new Date("2026-11-23T00:00:00.000Z"), now)).toBe("EXPIRED");
    expect(statusForExpiry(new Date("2026-11-27T00:00:00.000Z"), now)).toBe("NEAR_EXPIRY");
    expect(statusForExpiry(new Date("2026-11-28T00:00:00.000Z"), now)).toBe("FRESH");
  });

  it("different unit: no same-unit row (a new row is created), and the merge endpoint refuses other units", async () => {
    const existing = (await add("Cà rốt", "KILOGRAM")).body.data;
    const found = await match("Cà rốt", "PIECE");
    expect(found.body.data.existing).toBeNull();
    expect(found.body.data.otherUnits).toBe(1);
    expect((await api("POST", `/api/inventory/items/${existing.id}/add?familyId=${familyId}`, { quantity: 2, unit: "PIECE" })).status).toBe(409);
    expect((await add("Cà rốt", "PIECE")).status).toBe(201);
    expect(db.rows).toHaveLength(2);
  });

  it("'Thêm riêng' is a normal create: a second row, nothing merged", async () => {
    await add("Cà rốt");
    await add("Cà rốt");
    expect(db.rows).toHaveLength(2);
    expect(db.rows.every((row) => row.quantity === 1)).toBe(true);
  });

  it("older rows without productId match by normalized name; expired or other families' rows never match", async () => {
    db.rows.push({ id: "old", familyId, name: "cà RỐT", quantity: 1, unit: "KILOGRAM", status: "FRESH", productId: null, imageUrl: null, expiryDate: null, deletedAt: null, createdAt: new Date(2025, 0, 1) });
    const theirsId = "44444444-4444-4444-8444-444444444444";
    db.rows.push({ id: theirsId, familyId: otherFamilyId, name: "Cà rốt", quantity: 5, unit: "KILOGRAM", status: "FRESH", productId: "p-carrot", imageUrl: null, expiryDate: null, deletedAt: null, createdAt: new Date(2024, 0, 1) });
    db.rows.push({ id: "expired", familyId, name: "Cà rốt", quantity: 1, unit: "KILOGRAM", status: "EXPIRED", productId: "p-carrot", imageUrl: null, expiryDate: null, deletedAt: null, createdAt: new Date(2023, 0, 1) });
    expect((await match("Cà rốt")).body.data.existing.id).toBe("old");
    expect((await match("Cà rốt", "KILOGRAM", otherFamilyId)).status).toBe(403);
    db.rows = db.rows.filter((row) => row.id !== "old");
    expect((await match("Cà rốt")).body.data.existing).toBeNull();
    // Another family's row cannot be merged into through this family's scope.
    expect((await api("POST", `/api/inventory/items/${theirsId}/add?familyId=${familyId}`, { quantity: 1, unit: "KILOGRAM" })).status).toBe(404);
    expect(db.rows.find((row) => row.id === theirsId)?.quantity).toBe(5);
  });
});
