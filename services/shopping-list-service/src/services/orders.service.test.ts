import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

/** In-memory orders and cart lines, enough of Prisma's API for the order flow. */
type Order = Record<string, any> & { id: string; familyId: string; status: string };
const db = vi.hoisted(() => ({ orders: [] as Order[], lines: [] as Array<Record<string, any>>, history: [] as unknown[], promotions: [] as Array<Record<string, any>> }));
const match = (row: Record<string, any>, where: Record<string, any>): boolean => Object.entries(where).every(([key, value]) => {
  if (key === "OR") return (value as Array<Record<string, any>>).some((entry) => match(row, entry));
  if (value && typeof value === "object" && "not" in value) return row[key] !== value.not;
  if (value && typeof value === "object" && "in" in value) return value.in.includes(row[key]);
  if (value && typeof value === "object" && "gte" in value) return row[key] != null && new Date(row[key]) >= value.gte;
  return (row[key] ?? null) === value;
});
const mocks = vi.hoisted(() => {
  const purchase = {
    create: vi.fn(async ({ data }: { data: Order }) => { db.orders.push({ ...data }); return data; }),
    findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
      const order = db.orders.find((row) => match(row, where));
      return order ? { ...order, items: db.lines.filter((line) => line.purchaseId === order.id) } : null;
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({ ...db.orders.find((row) => row.id === where.id)!, items: db.lines.filter((line) => line.purchaseId === where.id) })),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const hit = db.orders.filter((row) => match(row, where));
      hit.forEach((row) => Object.assign(row, data));
      return { count: hit.length };
    }),
    findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => db.orders.filter((row) => match(row, where)).map((order) => ({ ...order, items: db.lines.filter((line) => line.purchaseId === order.id) }))),
    count: vi.fn(async () => db.orders.length),
  };
  const shoppingItem = {
    findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => db.lines.filter((line) => match(line, where))),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const hit = db.lines.filter((line) => match(line, where));
      hit.forEach((line) => Object.assign(line, data));
      return { count: hit.length };
    }),
    count: vi.fn(async ({ where }: { where: Record<string, any> }) => db.lines.filter((line) => match(line, where)).length),
  };
  const shoppingList = { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn(async () => [{ id: "77777777-7777-4777-8777-777777777777", status: "ACTIVE", items: db.lines }]) };
  const purchaseHistory = { upsert: vi.fn(async (args: unknown) => { db.history.push(args); return args; }) };
  // Running checkout promotions (the service filters by date in the query; tests store only running ones).
  const checkoutPromotion = { findMany: vi.fn(async () => db.promotions) };
  const prisma = { purchase, shoppingItem, shoppingList, purchaseHistory, checkoutPromotion, $transaction: vi.fn() };
  prisma.$transaction.mockImplementation(async (run: (tx: typeof prisma) => Promise<unknown>) => run(prisma));
  return { prisma, axios: { post: vi.fn(), get: vi.fn(async () => ({ data: { items: [] } })) } };
});
vi.mock("../lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("axios", () => ({ default: mocks.axios }));

import { OrdersService, vnDayPlus } from "./orders.service";
import { checkoutBodySchema } from "../validators/shopping-list.validator";
import { requireShipper } from "../middleware/auth.middleware";
import { ShoppingListController } from "../controllers/shopping-list.controller";
import { errorHandler } from "../middleware/error.middleware";

const familyId = "11111111-1111-4111-8111-111111111111";
const otherFamilyId = "22222222-2222-4222-8222-222222222222";
const buyer = "33333333-3333-4333-8333-333333333333";
const shipper = "44444444-4444-4444-8444-444444444444";
const otherShipper = "44444444-4444-4444-8444-444444444445";
const listId = "77777777-7777-4777-8777-777777777777";
const delivery = { address: "12 Lê Lợi, Quận 1, TP. Hồ Chí Minh", latitude: 10.77, longitude: 106.7, receiverName: "Lan", receiverPhone: "0901 234 567", note: "Gọi trước" };
const cartLine = (id: string, extra: Record<string, unknown> = {}) => ({
  id, shoppingListId: listId, name: "Thịt heo", quantity: 1.5, unit: "KILOGRAM", isPurchased: false, inventoryAppliedAt: null, purchaseId: null,
  productId: "p-pork", unitPrice: 120000, discountPercent: 10, createdAt: new Date(), ...extra,
});
const inventoryCalls = () => mocks.axios.post.mock.calls.map((call) => [String(call[0]).replace(/^.*\/internal/, ""), call[1]]);

beforeEach(() => {
  vi.clearAllMocks();
  db.orders.length = 0; db.lines.length = 0; db.history.length = 0; db.promotions.length = 0;
  mocks.prisma.$transaction.mockImplementation(async (run: (tx: typeof mocks.prisma) => Promise<unknown>) => run(mocks.prisma));
  mocks.prisma.shoppingList.findFirst.mockResolvedValue({ id: listId, familyId, status: "ACTIVE" });
  mocks.axios.post.mockResolvedValue({ data: { success: true, data: {} } });
});

const place = async () => {
  db.lines.push(cartLine("55555555-5555-4555-8555-555555555551"), cartLine("55555555-5555-4555-8555-555555555552", { name: "Rau muống", unit: "PACK", quantity: 2, productId: null, unitPrice: 12000, discountPercent: null }));
  return OrdersService.place(familyId, buyer, delivery, [], new Map([["p-pork", { group: "Thịt", shelfLifeDays: 3 }]]));
};

describe("placing an order (Đặt hàng, COD)", () => {
  it("Kho gets 'Đang giao' rows first, then one PENDING order with the cart's rounded total as COD amount; the lines leave the cart", async () => {
    const order = await place();
    expect(order).toMatchObject({ status: "PENDING", paymentMethod: "COD", buyerUserId: buyer, itemCount: 2, total: 162000 + 24000, codAmount: 186000, receiverPhone: "0901234567", deliveryAddress: delivery.address });
    const [first] = inventoryCalls();
    expect(first[0]).toBe("/deliveries/pending");
    expect(first[1]).toMatchObject({ orderId: order.id, familyId, createdByUserId: buyer, lines: [{ name: "Thịt heo", categoryName: "Thịt", productId: "p-pork" }, { name: "Rau muống", unit: "PACK" }] });
    expect(db.lines.every((line) => line.purchaseId === order.id)).toBe(true);
    expect(db.lines[0]).toMatchObject({ paidUnitPrice: 108000, lineTotal: 162000, shelfLifeDays: 3, groupName: "Thịt" });
    // Everything ordered: the cart (list) is completed.
    expect(mocks.prisma.shoppingList.update).toHaveBeenCalledWith({ where: { id: listId }, data: { status: "COMPLETED", activeFamilyId: null } });
  });

  it("Kho unavailable: 503 and nothing is written (the cart stays)", async () => {
    mocks.axios.post.mockRejectedValueOnce(new Error("down"));
    await expect(place()).rejects.toMatchObject({ statusCode: 503, code: "INVENTORY_SYNC_FAILED" });
    expect(db.orders).toHaveLength(0);
    expect(db.lines.every((line) => line.purchaseId === null)).toBe(true);
  });

  it("an empty cart cannot be ordered", async () => {
    await expect(OrdersService.place(familyId, buyer, delivery, [], new Map())).rejects.toMatchObject({ statusCode: 409, code: "CART_EMPTY" });
  });

  it("validates the delivery: address, receiver and a Vietnamese phone are required; COD only", () => {
    const body = (patch: Record<string, unknown>) => checkoutBodySchema.safeParse({ familyId, delivery: { ...delivery, ...patch } });
    expect(body({}).success).toBe(true);
    expect(body({ receiverPhone: "+84 912 345 678" }).success).toBe(true);
    expect(body({ receiverPhone: "12345" }).success).toBe(false);
    expect(body({ receiverPhone: "0123456789" }).success).toBe(false); // 01x is not a mobile prefix any more
    expect(body({ receiverName: " " }).success).toBe(false);
    expect(body({ address: "" }).success).toBe(false);
    expect(body({ paymentMethod: "CARD" }).success).toBe(false);
  });
});

describe("status transitions", () => {
  it("customer cancels only while PENDING; repeating it is a no-op that re-runs the Kho cleanup", async () => {
    const order = await place();
    mocks.axios.post.mockClear();
    expect((await OrdersService.cancel(order.id, familyId)).status).toBe("CANCELLED");
    expect((await OrdersService.cancel(order.id, familyId)).status).toBe("CANCELLED");
    expect(inventoryCalls().map(([path]) => path)).toEqual([`/deliveries/${order.id}/cancel`, `/deliveries/${order.id}/cancel`]);
    const second = await place();
    await OrdersService.accept(second.id, shipper);
    await expect(OrdersService.cancel(second.id, familyId)).rejects.toMatchObject({ statusCode: 409, code: "ORDER_NOT_CANCELLABLE" });
  });

  it("cancelling updates the order's one notice row to 'Đơn hàng đã hủy' once (not on a repeated cancel)", async () => {
    process.env.INTERNAL_API_KEY = "k".repeat(40);
    const order = await place();
    await OrdersService.cancel(order.id, familyId);
    await OrdersService.cancel(order.id, familyId);
    expect(mocks.axios.post.mock.calls.filter((call) => String(call[0]).includes("/internal/notifications")).map((call) => call[1])).toEqual([expect.objectContaining({ title: "Đơn hàng đã hủy", dedupeKey: `order:${order.id}`, replace: true, data: { type: "order", orderId: order.id, status: "CANCELLED" } })]);
  });

  it("another family cannot see or cancel the order (404)", async () => {
    const order = await place();
    await expect(OrdersService.cancel(order.id, otherFamilyId)).rejects.toMatchObject({ statusCode: 404 });
    expect(db.orders[0].status).toBe("PENDING");
  });

  it("shipper: accept (PENDING → SHIPPING), only one shipper wins; the same shipper repeating is a no-op", async () => {
    const order = await place();
    expect(await OrdersService.accept(order.id, shipper)).toMatchObject({ status: "SHIPPING", shipperId: shipper });
    expect(await OrdersService.accept(order.id, shipper)).toMatchObject({ status: "SHIPPING", shipperId: shipper });
    await expect(OrdersService.accept(order.id, otherShipper)).rejects.toMatchObject({ statusCode: 409, code: "ORDER_NOT_AVAILABLE" });
  });

  it("delivered: lines go to Kho with expiry = delivery day (Vietnam) + shelf life, marked bought; idempotent", async () => {
    const order = await place();
    await OrdersService.accept(order.id, shipper);
    await expect(OrdersService.deliver(order.id, otherShipper)).rejects.toMatchObject({ statusCode: 403, code: "NOT_YOUR_ORDER" });
    mocks.axios.post.mockClear();
    const delivered = await OrdersService.deliver(order.id, shipper);
    expect(delivered.status).toBe("DELIVERED");
    const deliveredAt = new Date(db.orders[0].deliveredAt);
    const [call] = inventoryCalls();
    expect(call[0]).toBe(`/deliveries/${order.id}/deliver`);
    expect(call[1].lines[0]).toMatchObject({ name: "Thịt heo", expiryDate: vnDayPlus(deliveredAt, 3) });
    expect(call[1].lines[1]).not.toHaveProperty("expiryDate"); // no shelf life known: no expiry
    expect(db.lines.every((line) => line.isPurchased && line.inventoryAppliedAt)).toBe(true);
    await OrdersService.deliver(order.id, shipper); // retried: same order, Kho step again (idempotent there)
    expect(db.orders[0].status).toBe("DELIVERED");
  });

  it("failed: only the assigned shipper, only while SHIPPING, with a reason; Kho's pending rows are removed", async () => {
    const order = await place();
    await expect(OrdersService.fail(order.id, shipper, "Không liên lạc được")).rejects.toMatchObject({ statusCode: 403 }); // not accepted yet
    await OrdersService.accept(order.id, shipper);
    mocks.axios.post.mockClear();
    expect(await OrdersService.fail(order.id, shipper, "Không liên lạc được")).toMatchObject({ status: "FAILED", failReason: "Không liên lạc được" });
    expect(inventoryCalls()[0][0]).toBe(`/deliveries/${order.id}/cancel`);
    await expect(OrdersService.deliver(order.id, shipper)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("vnDayPlus counts in Vietnam days", () => {
    expect(vnDayPlus(new Date("2026-11-26T18:00:00Z"), 2)).toBe("2026-11-29"); // 01:00 on 27/11 in Vietnam
    expect(vnDayPlus(new Date("2026-11-26T10:00:00Z"), 0)).toBe("2026-11-26");
  });
});

describe("authorization", () => {
  const res = () => ({ statusCode: 200, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } });

  it("shipper endpoints need the SHIPPER role", () => {
    for (const role of [undefined, "USER", "ADMIN"]) {
      const response = res(); let passed = false;
      requireShipper({ authUser: { userId: buyer, token: "t", role } } as unknown as Request, response as unknown as Response, (() => { passed = true; }) as NextFunction);
      expect([passed, response.statusCode]).toEqual([false, 403]);
    }
    let passed = false;
    requireShipper({ authUser: { userId: shipper, token: "t", role: "SHIPPER" } } as unknown as Request, res() as unknown as Response, (() => { passed = true; }) as NextFunction);
    expect(passed).toBe(true);
  });

  it("the shipper sees delivery data and a receipt only (no family, buyer or other user data)", async () => {
    await place();
    const [order] = await OrdersService.shipperList(shipper, "available");
    expect(Object.keys(order).sort()).toEqual(["codAmount", "deliveredAt", "deliveryAddress", "discountAmount", "distanceKm", "failReason", "failedAt", "id", "itemCount", "items", "latitude", "longitude", "note", "orderedAt", "paymentMethod", "promotionName", "receiverName", "receiverPhone", "shippingAt", "status", "subtotal"]);
    expect(order).not.toHaveProperty("familyId");
    expect(order).not.toHaveProperty("buyerUserId");
    // Receipt: unit price after discount, the original when discounted, line total; COD = total.
    expect(order.items[0]).toEqual({ name: "Thịt heo", quantity: 1.5, unit: "KILOGRAM", unitLabel: null, unitPrice: 108000, originalUnitPrice: 120000, lineTotal: 162000 });
    expect(order.items[1]).toMatchObject({ name: "Rau muống", unitPrice: 12000, originalUnitPrice: null, lineTotal: 24000 });
    expect(order.codAmount).toBe(order.items.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0));
  });

  it("orders of another family: 403 from the family check, nothing read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { family: { id: otherFamilyId } } }) }));
    const response = res();
    let failure: unknown;
    const req = { query: { familyId }, authUser: { userId: buyer, token: "t" } } as unknown as Request;
    await ShoppingListController.orders(req, response as unknown as Response, ((error: unknown) => { failure = error; }) as NextFunction);
    errorHandler(failure, req, response as unknown as Response, (() => undefined) as NextFunction);
    vi.unstubAllGlobals();
    expect(response.statusCode).toBe(403);
    expect(mocks.prisma.purchase.findMany).not.toHaveBeenCalled();
  });
});

describe("shipper phase B2", () => {
  const noticeCalls = () => mocks.axios.post.mock.calls.filter((call) => String(call[0]).includes("/internal/notifications")).map((call) => call[1]);

  it("accept race: the second shipper gets 'Đơn đã có người nhận'; the buyer gets one 'đang được giao' notice", async () => {
    process.env.INTERNAL_API_KEY = "k".repeat(40);
    const order = await place();
    await OrdersService.accept(order.id, shipper);
    await OrdersService.accept(order.id, shipper); // retry: no second notice
    await expect(OrdersService.accept(order.id, otherShipper)).rejects.toMatchObject({ statusCode: 409, message: "Đơn đã có người nhận." });
    const notices = noticeCalls();
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ userId: buyer, type: "SYSTEM", title: "Đơn hàng đang được giao", data: { type: "order", orderId: order.id, status: "SHIPPING" }, dedupeKey: `order:${order.id}`, replace: true });
  });

  it("one notice row per order: every status uses the key order:<id> with replace; a failed one names the reason", async () => {
    process.env.INTERNAL_API_KEY = "k".repeat(40);
    const first = await place();
    await OrdersService.accept(first.id, shipper);
    await OrdersService.deliver(first.id, shipper);
    await OrdersService.deliver(first.id, shipper); // retried
    const second = await place();
    await OrdersService.accept(second.id, shipper);
    await OrdersService.fail(second.id, shipper, "Sai địa chỉ");
    const firstNotices = noticeCalls().filter((notice) => notice.dedupeKey === `order:${first.id}`);
    expect(firstNotices.map((notice) => notice.data.status)).toEqual(["SHIPPING", "DELIVERED", "DELIVERED"]);
    expect(firstNotices.every((notice) => notice.replace === true)).toBe(true);
    expect(firstNotices.at(-1)?.title).toBe("Đơn hàng đã giao thành công");
    expect(noticeCalls().filter((notice) => notice.dedupeKey === `order:${second.id}`).at(-1)?.title).toBe("Đơn hàng không giao được: Sai địa chỉ");
    // Every key is per order, never per status.
    expect(new Set(noticeCalls().map((notice) => notice.dedupeKey))).toEqual(new Set([`order:${first.id}`, `order:${second.id}`]));
  });

  it("waiting orders nearest first when the shipper's position is known; history = mine, delivered / failed, newest first", async () => {
    db.lines.push(cartLine("55555555-5555-4555-8555-555555555561"));
    const far = await OrdersService.place(familyId, buyer, { ...delivery, latitude: 10.9, longitude: 106.9 }, [], new Map());
    db.lines.push(cartLine("55555555-5555-4555-8555-555555555562"));
    const near = await OrdersService.place(familyId, buyer, { ...delivery, latitude: 10.7701, longitude: 106.7001 }, [], new Map());
    const origin = { latitude: 10.77, longitude: 106.7 };
    const list = await OrdersService.shipperList(shipper, "available", origin);
    expect(list.map((order) => order.id)).toEqual([near.id, far.id]);
    expect(list[0].distanceKm).toBe(0);
    expect(list[1].distanceKm).toBeGreaterThan(20);
    await OrdersService.accept(near.id, shipper);
    await OrdersService.deliver(near.id, shipper);
    expect((await OrdersService.shipperList(shipper, "history")).map((order) => order.id)).toEqual([near.id]);
    expect(await OrdersService.shipperList(otherShipper, "history")).toEqual([]);
  });

  it("a shipper can open a waiting order or their own, not another shipper's", async () => {
    const order = await place();
    expect((await OrdersService.shipperDetail(order.id, otherShipper)).id).toBe(order.id);
    await OrdersService.accept(order.id, shipper);
    expect((await OrdersService.shipperDetail(order.id, shipper)).status).toBe("SHIPPING");
  });

  it("disabling a shipper releases their deliveries back to waiting", async () => {
    const order = await place();
    await OrdersService.accept(order.id, shipper);
    expect(await OrdersService.releaseShipper(shipper)).toBe(1);
    expect(db.orders[0]).toMatchObject({ status: "PENDING", shipperId: null, shippingAt: null });
    expect(await OrdersService.releaseShipper(shipper)).toBe(0);
  });

  it("the family sees the shipper's name and phone once the order is on its way", async () => {
    process.env.INTERNAL_API_KEY = "k".repeat(40);
    const order = await place();
    mocks.axios.post.mockImplementation(async (url: string) => (String(url).includes("/profiles")
      ? { data: { items: [{ id: shipper, name: "Anh Tài", phone: "0912345678", email: "x@example.com" }] } }
      : { data: { success: true, data: {} } }));
    expect((await OrdersService.list(familyId)).items[0]).toMatchObject({ shipper: null });
    await OrdersService.accept(order.id, shipper);
    const [shown] = (await OrdersService.list(familyId)).items;
    expect(shown).toMatchObject({ status: "SHIPPING", shipper: { name: "Anh Tài", phone: "0912345678" } });
    expect(shown).not.toHaveProperty("shipperId");
    expect(JSON.stringify(shown)).not.toContain("x@example.com");
  });
});

describe("active shipper check", () => {
  it("a disabled account is refused (403) even with a valid SHIPPER token; answers are cached briefly", async () => {
    const { requireActiveShipper, clearShipperCache } = await import("../middleware/auth.middleware");
    clearShipperCache();
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ active: false }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ active: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const run = async (userId: string) => {
      const res = { statusCode: 200, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
      let passed = false;
      await requireActiveShipper({ authUser: { userId, token: "t", role: "SHIPPER" } } as never, res as never, (() => { passed = true; }) as never);
      return { passed, status: res.statusCode };
    };
    expect(await run(shipper)).toEqual({ passed: false, status: 403 });
    expect(await run(shipper)).toEqual({ passed: false, status: 403 }); // cached
    expect(await run(otherShipper)).toEqual({ passed: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});

describe("end to end through the API (customer + shipper)", () => {
  it("order → shipper accepts → delivered: Kho gets expiry from the delivery day, the family sees DELIVERED, notices once per status", async () => {
    const { createHmac } = await import("node:crypto");
    const express = (await import("express")).default;
    const router = (await import("../routes/shopping-list.route")).default;
    const { requireShoppingUser, clearShipperCache } = await import("../middleware/auth.middleware");
    clearShipperCache();
    process.env.JWT_SECRET = "api-flow-test-secret";
    process.env.INTERNAL_API_KEY = "k".repeat(40);
    const sign = (sub: string, role: string) => {
      const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 })}`;
      return `Bearer ${body}.${createHmac("sha256", "api-flow-test-secret").update(body).digest("base64url")}`;
    };
    // Signed once: signing again in a later second gives another exp, i.e. a different token (was flaky).
    const buyerToken = sign(buyer, "USER");
    const app = express();
    app.use(express.json());
    app.use("/api/shopping-list", requireShoppingUser, router);
    app.use(errorHandler);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as { port: number };
    const api = (method: string, path: string, token: string, body?: unknown) =>
      fetch(`http://127.0.0.1:${address.port}/api/shopping-list${path}`, { method, headers: { Authorization: token, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    // The test client reaches the app for real; the app's own calls are stubbed: family-service (the buyer belongs to
    // familyId, anyone else to another family) and auth-service (the shipper is active).
    const realFetch = globalThis.fetch;
    const stub = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      if (String(url).startsWith(`http://127.0.0.1:${address.port}`)) return realFetch(url, init as never);
      if (String(url).includes("/internal/shippers/")) return new Response(JSON.stringify({ active: true }), { status: 200 });
      const auth = init?.headers?.Authorization ?? "";
      return new Response(JSON.stringify({ data: { family: { id: auth === buyerToken ? familyId : otherFamilyId } } }), { status: 200 });
    });
    vi.stubGlobal("fetch", stub);
    try {
      db.lines.push(cartLine("55555555-5555-4555-8555-555555555571"));
      const placed = await api("POST", "/checkout", buyerToken, { familyId, items: [{ id: "55555555-5555-4555-8555-555555555571", shelfLifeDays: 3 }], delivery });
      expect(placed.status).toBe(201);
      const orderId = ((await placed.json()) as { data: { order: { id: string } } }).data.order.id;

      // A normal user cannot use the shipper API; another family cannot list this family's orders.
      expect((await api("GET", "/shipper/orders", buyerToken)).status).toBe(403);
      expect((await api("GET", `/orders?familyId=${familyId}`, sign("99999999-9999-4999-8999-999999999999", "USER"))).status).toBe(403);

      const available = (await (await api("GET", "/shipper/orders?scope=available", sign(shipper, "SHIPPER"))).json()) as { data: { items: Array<{ id: string; items: Array<{ unitPrice: number }> }> } };
      expect(available.data.items.map((order) => order.id)).toEqual([orderId]);
      expect(available.data.items[0].items[0].unitPrice).toBe(108000);
      expect((await api("POST", `/shipper/orders/${orderId}/accept`, sign(shipper, "SHIPPER"))).status).toBe(200);
      expect((await api("POST", `/shipper/orders/${orderId}/accept`, sign(otherShipper, "SHIPPER"))).status).toBe(409);
      expect((await api("POST", `/shipper/orders/${orderId}/deliver`, sign(shipper, "SHIPPER"))).status).toBe(200);

      const deliverCall = mocks.axios.post.mock.calls.find((call) => String(call[0]).endsWith(`/deliveries/${orderId}/deliver`));
      expect(deliverCall?.[1].lines[0].expiryDate).toBe(vnDayPlus(new Date(db.orders.find((order) => order.id === orderId)!.deliveredAt), 3));
      const mine = (await (await api("GET", `/orders?familyId=${familyId}`, buyerToken)).json()) as { data: { items: Array<{ status: string }> } };
      expect(mine.data.items[0].status).toBe("DELIVERED");
      const keys = mocks.axios.post.mock.calls.filter((call) => String(call[0]).includes("/internal/notifications")).map((call) => call[1].dedupeKey);
      expect(keys).toEqual([`order:${orderId}`, `order:${orderId}`]);
    } finally {
      vi.unstubAllGlobals();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("automatic checkout promotion", () => {
  const promo = (overrides: Record<string, unknown> = {}) => ({
    id: "99999999-9999-4999-8999-999999999991", name: "Giảm 10% đơn từ 150.000 đ", scope: "ORDER", groups: [], productIds: [], type: "PERCENT", value: 10,
    maxDiscount: 15_000, minSubtotal: 150_000, startDate: new Date("2000-01-01T00:00:00Z"), endDate: new Date("2999-12-31T00:00:00Z"),
    usageLimitPerUser: null, isActive: true, createdAt: new Date("2026-12-01T00:00:00Z"), ...overrides,
  });

  it("the order stores subtotal, promotion, discount and total; COD = discounted total; lines carry their share", async () => {
    db.promotions.push(promo(), promo({ id: "99999999-9999-4999-8999-999999999992", name: "Thịt giảm 5.000 đ", scope: "GROUP", groups: ["thịt"], type: "AMOUNT", value: 5_000, maxDiscount: null, minSubtotal: null }));
    const order = await place();
    // Subtotal 162 000 + 24 000 = 186 000; 10% = 18 600, capped at 15 000 (beats the 5 000 group promotion).
    expect(order).toMatchObject({ subtotal: 186_000, promotionId: "99999999-9999-4999-8999-999999999991", promotionName: "Giảm 10% đơn từ 150.000 đ", discountAmount: 15_000, total: 171_000, codAmount: 171_000 });
    const shares = db.lines.map((line) => line.discountShare);
    expect(shares.reduce((sum, part) => sum + part, 0)).toBe(15_000);
    expect(shares).toEqual([13_065, 1_935]); // 15 000 × 162/186 and × 24/186, largest remainder
  });

  it("preview returns exactly what Đặt hàng charges", async () => {
    db.promotions.push(promo());
    db.lines.push(cartLine("55555555-5555-4555-8555-555555555551"), cartLine("55555555-5555-4555-8555-555555555552", { name: "Rau muống", unit: "PACK", quantity: 2, productId: null, unitPrice: 12000, discountPercent: null }));
    const preview = await OrdersService.preview(familyId, buyer, [], new Map([["p-pork", { group: "Thịt" }]]));
    expect(preview).toEqual({ subtotal: 186_000, promotion: { id: "99999999-9999-4999-8999-999999999991", name: "Giảm 10% đơn từ 150.000 đ", discount: 15_000 }, discount: 15_000, total: 171_000, hint: null });
    const order = await OrdersService.place(familyId, buyer, delivery, [], new Map([["p-pork", { group: "Thịt" }]]), { expectedTotal: preview.total });
    expect(order.codAmount).toBe(preview.total);
  });

  it("re-validation: a different total than the app showed writes nothing and answers the new totals", async () => {
    db.promotions.push(promo());
    db.lines.push(cartLine("55555555-5555-4555-8555-555555555551"), cartLine("55555555-5555-4555-8555-555555555552", { name: "Rau muống", unit: "PACK", quantity: 2, productId: null, unitPrice: 12000, discountPercent: null }));
    // The app still showed the total without the promotion (it started meanwhile).
    await expect(OrdersService.place(familyId, buyer, delivery, [], new Map(), { expectedTotal: 186_000 }))
      .rejects.toMatchObject({ statusCode: 409, code: "TOTAL_CHANGED", data: { subtotal: 186_000, discount: 15_000, total: 171_000 } });
    expect(db.orders).toHaveLength(0);
    expect(inventoryCalls()).toHaveLength(0);
    expect(db.lines.every((line) => line.purchaseId === null)).toBe(true);
  });

  it("usage limit: orders on the way and delivered ones count; cancelled and failed ones do not", async () => {
    db.promotions.push(promo({ usageLimitPerUser: 1 }));
    const first = await place();
    expect(first.discountAmount).toBe(15_000);
    // The first order is still PENDING: it reserves the only use.
    const second = await place();
    expect(second.discountAmount).toBe(0);
    expect(second.total).toBe(186_000);
    // Cancelled: the use is released.
    db.orders.find((order) => order.id === first.id)!.status = "CANCELLED";
    db.orders.find((order) => order.id === second.id)!.status = "FAILED";
    expect((await place()).discountAmount).toBe(15_000);
  });

  it("an order without a promotion: subtotal = total = COD, no shares", async () => {
    const order = await place();
    expect(order).toMatchObject({ subtotal: 186_000, total: 186_000, codAmount: 186_000, promotionId: null, discountAmount: 0 });
    expect(db.lines.every((line) => line.discountShare === 0)).toBe(true);
  });
});
