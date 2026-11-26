import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

/** In-memory orders and cart lines, enough of Prisma's API for the order flow. */
type Order = Record<string, any> & { id: string; familyId: string; status: string };
const db = vi.hoisted(() => ({ orders: [] as Order[], lines: [] as Array<Record<string, any>>, history: [] as unknown[] }));
const match = (row: Record<string, any>, where: Record<string, any>) => Object.entries(where).every(([key, value]) => {
  if (value && typeof value === "object" && "not" in value) return row[key] !== value.not;
  if (value && typeof value === "object" && "in" in value) return value.in.includes(row[key]);
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
  const shoppingList = { findFirst: vi.fn(), update: vi.fn() };
  const purchaseHistory = { upsert: vi.fn(async (args: unknown) => { db.history.push(args); return args; }) };
  const prisma = { purchase, shoppingItem, shoppingList, purchaseHistory, $transaction: vi.fn() };
  prisma.$transaction.mockImplementation(async (run: (tx: typeof prisma) => Promise<unknown>) => run(prisma));
  return { prisma, axios: { post: vi.fn() } };
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
  db.orders.length = 0; db.lines.length = 0; db.history.length = 0;
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

  it("the shipper list carries delivery data only (no family, buyer or prices)", async () => {
    await place();
    const [order] = await OrdersService.shipperList(shipper, "available");
    expect(Object.keys(order).sort()).toEqual(["codAmount", "deliveryAddress", "id", "itemCount", "items", "latitude", "longitude", "note", "orderedAt", "paymentMethod", "receiverName", "receiverPhone", "shippingAt", "status"]);
    expect(order).not.toHaveProperty("familyId");
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
