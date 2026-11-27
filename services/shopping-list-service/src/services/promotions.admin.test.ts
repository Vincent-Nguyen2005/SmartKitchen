import { createHmac } from "node:crypto";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** In-memory checkout promotions + audit log. */
const db = vi.hoisted(() => ({ promotions: [] as Array<Record<string, any>>, audit: [] as Array<Record<string, any>> }));
const mocks = vi.hoisted(() => {
  const checkoutPromotion = {
    findMany: vi.fn(async () => db.promotions),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.promotions.find((row) => row.id === where.id) ?? null),
    create: vi.fn(async ({ data }: { data: Record<string, any> }) => { const row = { id: `99999999-9999-4999-8999-99999999999${db.promotions.length}`, createdAt: new Date(), updatedAt: new Date(), ...data }; db.promotions.push(row); return row; }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => { const row = db.promotions.find((entry) => entry.id === where.id)!; Object.assign(row, data); return row; }),
  };
  const promotionAuditLog = { create: vi.fn(async ({ data }: { data: Record<string, any> }) => { db.audit.push(data); return data; }) };
  const prisma = { checkoutPromotion, promotionAuditLog, $transaction: vi.fn() };
  prisma.$transaction.mockImplementation(async (run: (tx: typeof prisma) => Promise<unknown>) => run(prisma));
  return { prisma, axios: { post: vi.fn(async () => ({ data: {} })), put: vi.fn(async () => ({ data: {} })), get: vi.fn() } };
});
vi.mock("../lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("axios", () => ({ default: mocks.axios }));

import router from "../routes/shopping-list.route";
import { requireShoppingUser } from "../middleware/auth.middleware";
import { errorHandler } from "../middleware/error.middleware";
import { promotionDescription } from "./promotions.service";

const admin = "33333333-3333-4333-8333-333333333331";
const user = "33333333-3333-4333-8333-333333333332";
const sign = (sub: string, role: string) => {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `Bearer ${body}.${createHmac("sha256", "promo-admin-test-secret").update(body).digest("base64url")}`;
};
const valid = { name: "Giảm 10% đơn từ 200.000 đ", scope: "ORDER", type: "PERCENT", value: 10, maxDiscount: 50_000, minSubtotal: 200_000, startDate: "2026-11-01", endDate: "2099-12-31", usageLimitPerUser: 2, isActive: true };

let server: ReturnType<ReturnType<typeof express>["listen"]>;
let base = "";
const api = (method: string, path: string, token: string, body?: unknown) =>
  fetch(`${base}/api/shopping-list${path}`, { method, headers: { Authorization: token, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

beforeAll(async () => {
  process.env.JWT_SECRET = "promo-admin-test-secret";
  const app = express();
  app.use(express.json());
  app.use("/api/shopping-list", requireShoppingUser, router);
  app.use(errorHandler);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => { server.close(); delete process.env.JWT_SECRET; });
beforeEach(() => {
  vi.clearAllMocks();
  db.promotions.length = 0; db.audit.length = 0;
  process.env.INTERNAL_API_KEY = "k".repeat(40);
});

describe("Quản trị › Chương trình khuyến mãi", () => {
  it("authorization: USER and SHIPPER get 403 on every admin endpoint; no token 401; nothing is written", async () => {
    for (const token of [sign(user, "USER"), sign(user, "SHIPPER")]) {
      expect((await api("GET", "/admin/promotions", token)).status).toBe(403);
      expect((await api("POST", "/admin/promotions", token, valid)).status).toBe(403);
      expect((await api("PUT", "/admin/promotions/99999999-9999-4999-8999-999999999990", token, valid)).status).toBe(403);
      expect((await api("PATCH", "/admin/promotions/99999999-9999-4999-8999-999999999990/active", token, { isActive: false })).status).toBe(403);
    }
    expect((await api("GET", "/admin/promotions", "")).status).toBe(401);
    expect(mocks.prisma.checkoutPromotion.create).not.toHaveBeenCalled();
    expect(db.audit).toHaveLength(0);
  });

  it("admin creates a promotion: stored, audited, published in Thông báo (in-app promotion, idempotent key)", async () => {
    const response = await api("POST", "/admin/promotions", sign(admin, "ADMIN"), valid);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { promotion: Record<string, unknown>; feedSync: string } };
    expect(body.data.promotion).toMatchObject({ name: valid.name, scope: "ORDER", type: "PERCENT", value: 10, maxDiscount: 50_000, startDate: "2026-11-01", endDate: "2099-12-31", status: "RUNNING" });
    expect(body.data.feedSync).toBe("synced");
    expect(db.audit).toEqual([expect.objectContaining({ adminUserId: admin, action: "CREATE" })]);
    const [url, payload] = mocks.axios.put.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(url).toMatch(/\/internal\/promotions\/checkout-promotion%3A/);
    expect(payload).toMatchObject({ title: valid.name, discountInfo: null, description: promotionDescription({ ...valid, scope: "ORDER", type: "PERCENT" }) });
  });

  it("validation: end before start, bad percent / amount, missing groups / products, cap on an amount, ended end date", async () => {
    const token = sign(admin, "ADMIN");
    const fieldsOf = async (patch: Record<string, unknown>) => {
      const response = await api("POST", "/admin/promotions", token, { ...valid, ...patch });
      return { status: response.status, body: (await response.json()) as { details?: Record<string, string[]>; code?: string } };
    };
    expect((await fieldsOf({ startDate: "2099-12-31", endDate: "2099-12-01" })).body.details).toHaveProperty("endDate");
    expect((await fieldsOf({ value: 0 })).body.details).toHaveProperty("value");
    expect((await fieldsOf({ value: 101 })).body.details).toHaveProperty("value");
    expect((await fieldsOf({ type: "AMOUNT", value: 500, maxDiscount: null })).body.details).toHaveProperty("value");
    expect((await fieldsOf({ type: "AMOUNT", value: 20_000, maxDiscount: 10_000 })).body.details).toHaveProperty("maxDiscount");
    expect((await fieldsOf({ scope: "GROUP", groups: [] })).body.details).toHaveProperty("groups");
    expect((await fieldsOf({ scope: "PRODUCTS", productIds: [] })).body.details).toHaveProperty("productIds");
    expect((await fieldsOf({ name: " " })).body.details).toHaveProperty("name");
    expect((await fieldsOf({ startDate: "2026-02-30" })).body.details).toHaveProperty("startDate");
    expect((await fieldsOf({ startDate: "2020-01-01", endDate: "2020-01-31" }))).toMatchObject({ status: 400, body: { code: "PROMOTION_ENDED" } });
    expect(db.promotions).toHaveLength(0);
  });

  it("edit and disable are audited; a disabled promotion is withdrawn from Thông báo; unknown id 404", async () => {
    const token = sign(admin, "ADMIN");
    await api("POST", "/admin/promotions", token, valid);
    const id = db.promotions[0].id as string;
    const edited = await api("PUT", `/admin/promotions/${id}`, token, { ...valid, scope: "GROUP", groups: ["Rau củ", "Rau củ"], value: 15 });
    expect(edited.status).toBe(200);
    expect(db.promotions[0]).toMatchObject({ scope: "GROUP", groups: ["Rau củ"], productIds: [], value: 15 });
    const off = await api("PATCH", `/admin/promotions/${id}/active`, token, { isActive: false });
    expect(((await off.json()) as { data: { promotion: { status: string } } }).data.promotion.status).toBe("OFF");
    expect(String((mocks.axios.post.mock.calls.at(-1) as unknown[] | undefined)?.[0])).toMatch(/\/deactivate$/);
    expect(db.audit.map((entry) => entry.action)).toEqual(["CREATE", "UPDATE", "DISABLE"]);
    expect((await api("PATCH", "/admin/promotions/99999999-9999-4999-8999-999999999998/active", token, { isActive: true })).status).toBe(404);
  });

  it("list: status labels (Đang chạy first, then Sắp diễn ra, Hết hạn, Tắt)", async () => {
    const row = (id: string, startDate: string, endDate: string, isActive = true) => ({ ...valid, id, groups: [], productIds: [], startDate: new Date(`${startDate}T00:00:00Z`), endDate: new Date(`${endDate}T00:00:00Z`), isActive, createdAt: new Date(), updatedAt: new Date() });
    db.promotions.push(row("off", "2026-01-01", "2099-01-01", false), row("ended", "2020-01-01", "2020-01-31"), row("upcoming", "2099-01-01", "2099-01-31"), row("running", "2020-01-01", "2099-01-31"));
    const response = await api("GET", "/admin/promotions", sign(admin, "ADMIN"));
    const { items } = ((await response.json()) as { data: { items: Array<{ id: string; status: string }> } }).data;
    expect(items.map((item) => [item.id, item.status])).toEqual([["running", "RUNNING"], ["upcoming", "UPCOMING"], ["ended", "ENDED"], ["off", "OFF"]]);
  });
});

describe("GET /promotions/active (Đi chợ tags and banner)", () => {
  it("any signed-in user gets the running promotions, public fields only, ending soonest first", async () => {
    const row = (id: string, endDate: string, extra: Record<string, unknown> = {}) => ({ ...valid, id, groups: [], productIds: [], startDate: new Date("2020-01-01T00:00:00Z"), endDate: new Date(`${endDate}T00:00:00Z`), createdBy: admin, createdAt: new Date(), updatedAt: new Date(), ...extra });
    // The query keeps only active rows within their days (Prisma filter); the mock returns what the query would.
    db.promotions.push(row("later", "2099-12-31"), row("sooner", "2099-06-30", { scope: "GROUP", groups: ["Rau củ"] }));
    for (const token of [sign(user, "USER"), sign(admin, "ADMIN")]) {
      const response = await api("GET", "/promotions/active", token);
      expect(response.status).toBe(200);
      const { items } = ((await response.json()) as { data: { items: Array<Record<string, unknown>> } }).data;
      expect(items.map((item) => item.id)).toEqual(["sooner", "later"]);
      expect(Object.keys(items[0]).sort()).toEqual(["endDate", "groups", "id", "maxDiscount", "minSubtotal", "name", "productIds", "scope", "startDate", "type", "usageLimitPerUser", "value"]);
    }
    expect((mocks.prisma.checkoutPromotion.findMany.mock.calls.at(-1) as unknown[] | undefined)?.[0]).toMatchObject({ where: { isActive: true } });
    expect((await api("GET", "/promotions/active", "")).status).toBe(401);
  });
});
