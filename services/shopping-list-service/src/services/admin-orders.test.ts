import { createHmac } from "node:crypto";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** In-memory orders: enough of Prisma for the admin order list, detail and actions. */
type Row = Record<string, any>;
const db = vi.hoisted(() => ({ orders: [] as Row[], audit: [] as Row[] }));
const matches = (row: Row, where: Row): boolean => Object.entries(where).every(([key, value]) => {
  if (value === undefined) return true;
  if (key === "OR") return (value as Row[]).some((entry) => matches(row, entry));
  if (value && typeof value === "object" && "not" in value) return row[key] !== value.not;
  if (value && typeof value === "object" && "contains" in value) return typeof row[key] === "string" && (value.mode === "insensitive" ? row[key].toLowerCase().includes(String(value.contains).toLowerCase()) : row[key].includes(value.contains));
  return row[key] === value;
});
const mocks = vi.hoisted(() => {
  const purchase = {
    findMany: vi.fn(async ({ where, skip = 0, take = 100 }: { where: Row; skip?: number; take?: number }) => db.orders.filter((row) => matches(row, where)).sort((a, b) => b.purchasedAt - a.purchasedAt).slice(skip, skip + take)),
    count: vi.fn(async ({ where }: { where: Row }) => db.orders.filter((row) => matches(row, where)).length),
    groupBy: vi.fn(async ({ where }: { where: Row }) => {
      const counts = new Map<string, number>();
      for (const row of db.orders.filter((entry) => matches(entry, where))) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
      return [...counts].map(([status, count]) => ({ status, _count: { _all: count } }));
    }),
    findFirst: vi.fn(async ({ where }: { where: Row }) => { const row = db.orders.find((entry) => matches(entry, where)); return row ? { ...row, items: row.items ?? [] } : null; }),
    updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => { const hit = db.orders.filter((row) => matches(row, where)); hit.forEach((row) => Object.assign(row, data)); return { count: hit.length }; }),
  };
  const orderAuditLog = { create: vi.fn(async ({ data }: { data: Row }) => { db.audit.push(data); return data; }) };
  return { prisma: { purchase, orderAuditLog }, axios: { post: vi.fn(), get: vi.fn() } };
});
vi.mock("../lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("axios", () => ({ default: mocks.axios }));

import router from "../routes/shopping-list.route";
import { requireShoppingUser } from "../middleware/auth.middleware";
import { errorHandler } from "../middleware/error.middleware";
import { timelineOf } from "./admin-orders.service";

const admin = "33333333-3333-4333-8333-333333333331";
const user = "33333333-3333-4333-8333-333333333332";
const sign = (sub: string, role: string) => {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `Bearer ${body}.${createHmac("sha256", "admin-orders-test-secret").update(body).digest("base64url")}`;
};
const ADMIN = sign(admin, "ADMIN");
const order = (id: string, status: string, extra: Row = {}): Row => ({
  id, familyId: "11111111-1111-4111-8111-111111111111", buyerUserId: user, status, purchasedAt: new Date(`2026-11-${10 + Number(id.slice(-1))}T03:00:00Z`),
  shippingAt: null, deliveredAt: null, cancelledAt: null, failedAt: null, failReason: null, shipperId: null, deliveryAddress: "12 Lê Lợi, Quận 1",
  receiverName: "Lan", receiverPhone: "0901234567", note: null, latitude: null, longitude: null, paymentMethod: "COD", itemCount: 2,
  subtotal: 186_000, total: 171_000, codAmount: 171_000, discountAmount: 15_000, promotionName: "Giảm 10%", items: [], ...extra,
});
let server: ReturnType<ReturnType<typeof express>["listen"]>;
let base = "";
const api = async (method: string, path: string, token = ADMIN) => {
  const response = await fetch(`${base}/api/shopping-list${path}`, { method, headers: { Authorization: token, "content-type": "application/json" } });
  return { status: response.status, body: (await response.json()) as Row };
};

beforeAll(async () => {
  process.env.JWT_SECRET = "admin-orders-test-secret";
  const app = express().use(express.json()).use("/api/shopping-list", requireShoppingUser, router).use(errorHandler);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => { server.close(); delete process.env.JWT_SECRET; });
beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTERNAL_API_KEY = "k".repeat(40);
  db.audit.length = 0;
  db.orders = [
    order("aaaaaaaa-aaaa-4aaa-8aaa-000000000001", "PENDING"),
    order("aaaaaaaa-aaaa-4aaa-8aaa-000000000002", "SHIPPING", { shipperId: "44444444-4444-4444-8444-444444444444", shippingAt: new Date("2026-11-12T04:00:00Z"), receiverName: "Minh", receiverPhone: "0912345678", deliveryAddress: "5 Trần Phú, Hà Đông" }),
    order("aaaaaaaa-aaaa-4aaa-8aaa-000000000003", "DELIVERED", { deliveredAt: new Date("2026-11-13T05:00:00Z") }),
    order("aaaaaaaa-aaaa-4aaa-8aaa-000000000004", "CANCELLED", { cancelledAt: new Date("2026-11-14T03:30:00Z") }),
    order("aaaaaaaa-aaaa-4aaa-8aaa-000000000005", "FAILED", { failedAt: new Date("2026-11-15T06:00:00Z"), failReason: "Sai địa chỉ" }),
    // A direct (single-item) purchase: not a delivery order.
    order("aaaaaaaa-aaaa-4aaa-8aaa-000000000006", "DELIVERED", { deliveryAddress: null }),
  ];
  mocks.axios.post.mockImplementation(async (url: string) => (String(url).includes("/profiles")
    ? { data: { items: [{ id: "44444444-4444-4444-8444-444444444444", name: "Anh Tú", phone: "0900000000" }] } }
    : { data: { success: true } }));
});

describe("Quản trị › Đơn hàng", () => {
  it("non-admins get 403 on every admin order / revenue endpoint; nothing changes", async () => {
    for (const token of [sign(user, "USER"), sign(user, "SHIPPER")]) {
      expect((await api("GET", "/admin/orders", token)).status).toBe(403);
      expect((await api("GET", "/admin/orders/aaaaaaaa-aaaa-4aaa-8aaa-000000000001", token)).status).toBe(403);
      expect((await api("POST", "/admin/orders/aaaaaaaa-aaaa-4aaa-8aaa-000000000001/cancel", token)).status).toBe(403);
      expect((await api("POST", "/admin/orders/aaaaaaaa-aaaa-4aaa-8aaa-000000000002/unassign", token)).status).toBe(403);
      expect((await api("GET", "/admin/revenue", token)).status).toBe(403);
    }
    expect(db.orders.find((row) => row.id === "aaaaaaaa-aaaa-4aaa-8aaa-000000000001")?.status).toBe("PENDING");
    expect(db.audit).toHaveLength(0);
  });

  it("list: delivery orders only, newest first, status filter with counts per status, search by name / phone / address", async () => {
    const all = await api("GET", "/admin/orders");
    expect(all.body.data.items.map((row: Row) => row.id)).toEqual(["aaaaaaaa-aaaa-4aaa-8aaa-000000000005", "aaaaaaaa-aaaa-4aaa-8aaa-000000000004", "aaaaaaaa-aaaa-4aaa-8aaa-000000000003", "aaaaaaaa-aaaa-4aaa-8aaa-000000000002", "aaaaaaaa-aaaa-4aaa-8aaa-000000000001"]);
    expect(all.body.data.counts).toEqual({ PENDING: 1, SHIPPING: 1, DELIVERED: 1, CANCELLED: 1, FAILED: 1 });
    expect((await api("GET", "/admin/orders?status=SHIPPING")).body.data.items.map((row: Row) => row.id)).toEqual(["aaaaaaaa-aaaa-4aaa-8aaa-000000000002"]);
    expect((await api("GET", "/admin/orders?q=minh")).body.data.items.map((row: Row) => row.id)).toEqual(["aaaaaaaa-aaaa-4aaa-8aaa-000000000002"]);
    expect((await api("GET", "/admin/orders?q=0912%20345")).body.data.items.map((row: Row) => row.id)).toEqual(["aaaaaaaa-aaaa-4aaa-8aaa-000000000002"]);
    const byAddress = await api("GET", "/admin/orders?q=L%C3%AA%20L%E1%BB%A3i");
    expect(byAddress.body.data.counts).toMatchObject({ SHIPPING: 0, PENDING: 1 });
    expect((await api("GET", "/admin/orders?status=WRONG")).status).toBe(400);
  });

  it("detail: totals, promotion, shipper name / phone, timeline and reason", async () => {
    const detail = (await api("GET", "/admin/orders/aaaaaaaa-aaaa-4aaa-8aaa-000000000002")).body.data.order;
    expect(detail).toMatchObject({ status: "SHIPPING", subtotal: 186_000, discountAmount: 15_000, promotionName: "Giảm 10%", total: 171_000, shipper: { name: "Anh Tú", phone: "0900000000" } });
    expect(detail.timeline.map((step: Row) => step.status)).toEqual(["PENDING", "SHIPPING"]);
    expect((await api("GET", "/admin/orders/aaaaaaaa-aaaa-4aaa-8aaa-000000000005")).body.data.order).toMatchObject({ failReason: "Sai địa chỉ", shipper: null });
    expect((await api("GET", "/admin/orders/aaaaaaaa-aaaa-4aaa-8aaa-000000000006")).status).toBe(404);
  });

  it("cancel (PENDING only): Kho 'Đang giao' rows removed, the customer's notice says cancelled, audited", async () => {
    const response = await api("POST", "/admin/orders/aaaaaaaa-aaaa-4aaa-8aaa-000000000001/cancel");
    expect(response.body.data.order.status).toBe("CANCELLED");
    const calls = mocks.axios.post.mock.calls.map((call) => [String(call[0]), call[1]]);
    expect(calls.some(([url]) => url.endsWith("/api/inventory/internal/deliveries/aaaaaaaa-aaaa-4aaa-8aaa-000000000001/cancel"))).toBe(true);
    expect(calls.find(([url]) => url.includes("/internal/notifications"))?.[1]).toMatchObject({ title: "Đơn hàng đã hủy", dedupeKey: "order:aaaaaaaa-aaaa-4aaa-8aaa-000000000001", replace: true });
    expect(db.audit).toEqual([expect.objectContaining({ adminUserId: admin, action: "CANCEL", orderId: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001" })]);
    expect((await api("POST", "/admin/orders/aaaaaaaa-aaaa-4aaa-8aaa-000000000002/cancel")).status).toBe(409);
    expect((await api("POST", "/admin/orders/aaaaaaaa-aaaa-4aaa-8aaa-000000000003/cancel")).status).toBe(409);
  });

  it("Gỡ người giao (SHIPPING only): back to PENDING without a shipper, notice 'chờ người giao khác', Kho untouched, audited", async () => {
    const response = await api("POST", "/admin/orders/aaaaaaaa-aaaa-4aaa-8aaa-000000000002/unassign");
    expect(response.body.data.order).toMatchObject({ status: "PENDING", shipper: null });
    expect(db.orders.find((row) => row.id === "aaaaaaaa-aaaa-4aaa-8aaa-000000000002")).toMatchObject({ status: "PENDING", shipperId: null, shippingAt: null });
    const calls = mocks.axios.post.mock.calls.map((call) => [String(call[0]), call[1]]);
    expect(calls.some(([url]) => url.includes("/api/inventory/internal"))).toBe(false);
    expect(calls.find(([url]) => url.includes("/internal/notifications"))?.[1]).toMatchObject({ title: "Đơn hàng đang chờ người giao khác", data: { status: "PENDING" } });
    expect(db.audit).toEqual([expect.objectContaining({ action: "UNASSIGN_SHIPPER", orderId: "aaaaaaaa-aaaa-4aaa-8aaa-000000000002" })]);
    expect((await api("POST", "/admin/orders/aaaaaaaa-aaaa-4aaa-8aaa-000000000001/unassign")).status).toBe(409);
  });

  it("timeline keeps the steps in time order", () => {
    expect(timelineOf({ purchasedAt: new Date("2026-11-10T01:00:00Z"), shippingAt: new Date("2026-11-10T02:00:00Z"), deliveredAt: null, cancelledAt: null, failedAt: new Date("2026-11-10T03:00:00Z") }).map((step) => step.status)).toEqual(["PENDING", "SHIPPING", "FAILED"]);
  });
});
