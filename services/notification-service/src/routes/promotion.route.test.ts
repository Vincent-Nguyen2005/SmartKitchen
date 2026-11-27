import "express-async-errors";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  deviceToken: { upsert: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  notificationPreference: { upsert: vi.fn() },
  partnerSupermarket: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
  promotion: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
  notification: { findMany: vi.fn(), count: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
  notificationDismissal: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));
const dispatchMock = vi.hoisted(() => vi.fn());
const ensureMock = vi.hoisted(() => vi.fn(async () => 0));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../services/promotion-dispatch.service", () => ({ dispatchPromotion: dispatchMock, ensureActivePromotionRows: ensureMock, promotionDismissalKey: (id: string) => `promotion:${id}` }));

import promotionRouter from "./promotion.route";
import { errorHandler } from "../middleware/error-handler";

const app = express();
app.use(express.json());
app.use(promotionRouter);
app.use(errorHandler);
const KEY = "partner-test-key";
// Identity headers as the gateway sets them from a verified JWT. User A is "u1", user B is "u2".
const USER_A = { "x-user-id": "u1", "x-user-role": "USER" };
const ADMIN = { "x-user-id": "admin-1", "x-user-role": "ADMIN" };
const promo = (overrides: Record<string, unknown> = {}) => ({ title: "Cà chua giảm giá", productKeywords: ["Cà Chua", "ca chua"], startsAt: "2026-11-01T00:00:00Z", endsAt: "2026-11-30T00:00:00Z", ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PARTNER_API_KEY = KEY;
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => typeof arg === "function" ? (arg as (tx: typeof prismaMock) => unknown)(prismaMock) : Promise.all(arg as unknown[]));
});
afterEach(() => { delete process.env.PARTNER_API_KEY; });

describe("missing identity", () => {
  it.each([
    ["get", "/notifications"],
    ["patch", "/notifications/n1/read"],
    ["get", "/preferences"],
    ["put", "/preferences"],
    ["get", "/preferences/u1"],
    ["put", "/preferences/u1"],
    ["post", "/device-tokens"],
    ["delete", "/device-tokens/abc"],
    ["post", "/promotions/p1/dispatch"],
    ["post", "/notifications/delete"],
    ["get", "/notifications/dismissals"],
    ["post", "/notifications/dismissals"],
  ] as const)("%s %s without x-user-id is 401 and touches no data", async (method, path) => {
    const response = await request(app)[method](path).send({});
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
    expect(prismaMock.notification.findMany).not.toHaveBeenCalled();
    expect(prismaMock.notification.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.notificationPreference.upsert).not.toHaveBeenCalled();
    expect(prismaMock.deviceToken.upsert).not.toHaveBeenCalled();
    expect(prismaMock.deviceToken.updateMany).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(prismaMock.notification.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.notificationDismissal.createMany).not.toHaveBeenCalled();
  });

  it("ignores a client-sent userId when x-user-id is missing", async () => {
    expect((await request(app).get("/notifications?userId=u1")).status).toBe(401);
  });
});

describe("device tokens", () => {
  it("registers (upserts) a device token for the caller and reactivates it", async () => {
    prismaMock.deviceToken.upsert.mockResolvedValue({ id: "d1" });
    const response = await request(app).post("/device-tokens").set(USER_A).send({ token: "ExponentPushToken[x]", platform: "ANDROID" });
    expect(response.status).toBe(201);
    expect(prismaMock.deviceToken.upsert.mock.calls[0][0]).toMatchObject({ where: { token: "ExponentPushToken[x]" }, update: { userId: "u1", isActive: true }, create: { userId: "u1" } });
  });

  it("accepts a body userId equal to the caller (older clients)", async () => {
    prismaMock.deviceToken.upsert.mockResolvedValue({ id: "d1" });
    expect((await request(app).post("/device-tokens").set(USER_A).send({ userId: "u1", token: "t", platform: "IOS" })).status).toBe(201);
  });

  it("IDOR: user A cannot register a token for user B (403)", async () => {
    const response = await request(app).post("/device-tokens").set(USER_A).send({ userId: "u2", token: "t", platform: "IOS" });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("FORBIDDEN");
    expect(prismaMock.deviceToken.upsert).not.toHaveBeenCalled();
  });

  it("rejects an unknown platform with 400", async () => {
    expect((await request(app).post("/device-tokens").set(USER_A).send({ token: "t", platform: "WEB" })).status).toBe(400);
  });

  it("deactivates the caller's own token on DELETE (204)", async () => {
    prismaMock.deviceToken.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).delete("/device-tokens/abc").set(USER_A)).status).toBe(204);
    expect(prismaMock.deviceToken.updateMany).toHaveBeenCalledWith({ where: { token: "abc", userId: "u1" }, data: { isActive: false } });
  });

  it("IDOR: deleting another user's (or an unknown) token is 404", async () => {
    prismaMock.deviceToken.updateMany.mockResolvedValue({ count: 0 });
    const response = await request(app).delete("/device-tokens/token-of-u2").set(USER_A);
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("NOT_FOUND");
  });
});

describe("preferences", () => {
  it("creates default preferences for the caller on first read", async () => {
    prismaMock.notificationPreference.upsert.mockResolvedValue({ userId: "u1", pushEnabled: true });
    expect((await request(app).get("/preferences").set(USER_A)).body.pushEnabled).toBe(true);
    expect(prismaMock.notificationPreference.upsert.mock.calls[0][0].where).toEqual({ userId: "u1" });
    expect((await request(app).get("/preferences/u1").set(USER_A)).status).toBe(200);
  });

  it("validates quiet hours as HH:mm and allows clearing them with null", async () => {
    prismaMock.notificationPreference.upsert.mockResolvedValue({});
    expect((await request(app).put("/preferences").set(USER_A).send({ quietHoursStart: "25:00" })).status).toBe(400);
    expect((await request(app).put("/preferences").set(USER_A).send({ quietHoursStart: "7:00" })).status).toBe(400);
    expect((await request(app).put("/preferences").set(USER_A).send({ quietHoursStart: "22:00", quietHoursEnd: null, promotionEnabled: false })).status).toBe(200);
    expect(prismaMock.notificationPreference.upsert.mock.calls[0][0]).toMatchObject({ where: { userId: "u1" }, update: { quietHoursStart: "22:00", quietHoursEnd: null, promotionEnabled: false } });
  });

  it("IDOR: user A cannot read or update user B's preferences (403)", async () => {
    expect((await request(app).get("/preferences/u2").set(USER_A)).status).toBe(403);
    expect((await request(app).put("/preferences/u2").set(USER_A).send({ pushEnabled: false })).status).toBe(403);
    expect(prismaMock.notificationPreference.upsert).not.toHaveBeenCalled();
  });

  it("gives an admin no override on another user's preferences", async () => {
    expect((await request(app).get("/preferences/u2").set(ADMIN)).status).toBe(403);
  });
});

describe("partner ingestion (x-api-key)", () => {
  it("rejects partner calls without the right key", async () => {
    expect((await request(app).post("/partners").send({ name: "Mart" })).status).toBe(401);
    expect((await request(app).post("/partners").set("x-api-key", "wrong").send({ name: "Mart" })).status).toBe(401);
  });

  it("creates a partner (201) or returns the existing one (200)", async () => {
    prismaMock.partnerSupermarket.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "p1", name: "Mart" });
    prismaMock.partnerSupermarket.create.mockResolvedValue({ id: "p1", name: "Mart" });
    expect((await request(app).post("/partners").set("x-api-key", KEY).send({ name: "Mart" })).status).toBe(201);
    expect((await request(app).post("/partners").set("x-api-key", KEY).send({ name: "Mart" })).status).toBe(200);
  });

  it("ingests promotions with normalized, deduplicated keywords and upserts by title", async () => {
    prismaMock.partnerSupermarket.findUnique.mockResolvedValue({ id: "p1" });
    prismaMock.promotion.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "existing" });
    prismaMock.promotion.create.mockImplementation(({ data }: { data: object }) => ({ id: "new", ...data }));
    prismaMock.promotion.update.mockImplementation(({ data }: { data: object }) => ({ id: "existing", ...data }));
    const response = await request(app).post("/partners/p1/promotions").set("x-api-key", KEY).send([promo(), promo({ title: "Thịt bò" })]);
    expect(response.status).toBe(201);
    expect(prismaMock.promotion.create.mock.calls[0][0].data.productKeywords).toEqual(["ca chua"]);
    expect(prismaMock.promotion.update).toHaveBeenCalledTimes(1);
  });

  it("limits a batch to 500 promotions and 404s unknown partners", async () => {
    const tooMany = Array.from({ length: 501 }, (_, index) => promo({ title: `p${index}` }));
    expect((await request(app).post("/partners/p1/promotions").set("x-api-key", KEY).send(tooMany)).status).toBe(400);
    prismaMock.partnerSupermarket.findUnique.mockResolvedValue(null);
    expect((await request(app).post("/partners/missing/promotions").set("x-api-key", KEY).send([promo()])).status).toBe(404);
  });
});

describe("promotions and notifications", () => {
  it("lists promotions with keyword search, active filter and capped paging", async () => {
    prismaMock.promotion.findMany.mockResolvedValue([]);
    prismaMock.promotion.count.mockResolvedValue(0);
    const response = await request(app).get("/promotions?active=true&keyword=ca&page=2&limit=500");
    expect(response.body).toEqual({ items: [], page: 2, limit: 100, total: 0 });
    const args = prismaMock.promotion.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ isActive: true, title: { contains: "ca", mode: "insensitive" } });
    expect(args.skip).toBe(100);
  });

  it("matches active promotions by normalized keyword", async () => {
    prismaMock.promotion.findMany.mockResolvedValue([{ id: "a", productKeywords: ["ca chua"] }, { id: "b", productKeywords: ["thit bo"] }]);
    const response = await request(app).post("/promotions/match").send({ userId: "u1", keywords: ["Cà Chua"] });
    expect(response.body.promotions.map((item: { id: string }) => item.id)).toEqual(["a"]);
    expect((await request(app).post("/promotions/match").send({ userId: "u1", keywords: [] })).status).toBe(400);
  });

  it("lists only the caller's notifications and marks one as read", async () => {
    prismaMock.notification.findMany.mockResolvedValue([{ id: "n1" }]);
    prismaMock.notification.count.mockResolvedValue(1);
    expect((await request(app).get("/notifications?status=SENT").set(USER_A)).body.total).toBe(1);
    // Promotions are in-app only: the caller's rows for active promotions are made before listing.
    expect(ensureMock).toHaveBeenLastCalledWith("u1");
    expect(prismaMock.notification.findMany.mock.calls[0][0].where).toMatchObject({ userId: "u1", status: "SENT" });
    prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.notification.findUnique.mockResolvedValue({ id: "n1", status: "READ" });
    expect((await request(app).patch("/notifications/n1/read").set(USER_A)).body.status).toBe("READ");
    expect(prismaMock.notification.updateMany.mock.calls[0][0].where).toEqual({ id: "n1", userId: "u1" });
  });

  it("accepts ?userId equal to the caller and rejects an unknown status with 400", async () => {
    prismaMock.notification.findMany.mockResolvedValue([]);
    prismaMock.notification.count.mockResolvedValue(0);
    expect((await request(app).get("/notifications?userId=u1").set(USER_A)).status).toBe(200);
    expect((await request(app).get("/notifications?status=BOGUS").set(USER_A)).status).toBe(400);
  });

  it("IDOR: user A cannot list user B's inbox (403)", async () => {
    const response = await request(app).get("/notifications?userId=u2").set(USER_A);
    expect(response.status).toBe(403);
    expect(prismaMock.notification.findMany).not.toHaveBeenCalled();
  });

  it("IDOR: marking another user's (or an unknown) notification as read is 404", async () => {
    prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });
    const response = await request(app).patch("/notifications/n-of-u2/read").set(USER_A);
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("NOT_FOUND");
    expect(prismaMock.notification.findUnique).not.toHaveBeenCalled();
  });

  it("dispatch requires the ADMIN role: USER is 403", async () => {
    const response = await request(app).post("/promotions/p1/dispatch").set(USER_A).send({ userIds: ["u1"] });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("FORBIDDEN");
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("dispatch does not accept the partner key instead of the admin role", async () => {
    expect((await request(app).post("/promotions/p1/dispatch").set("x-api-key", KEY).send({})).status).toBe(401);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("admin dispatches to the given users or to every user with an active token (200)", async () => {
    dispatchMock.mockResolvedValue(2);
    const response = await request(app).post("/promotions/p1/dispatch").set(ADMIN).send({ userIds: ["u1", "u2"] });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ dispatched: 2 });
    expect(dispatchMock).toHaveBeenLastCalledWith("p1", ["u1", "u2"]);
    prismaMock.deviceToken.findMany.mockResolvedValue([{ userId: "u9" }]);
    await request(app).post("/promotions/p1/dispatch").set(ADMIN).send({});
    expect(dispatchMock).toHaveBeenLastCalledWith("p1", ["u9"]);
  });
});

describe("DELETE /promotions/:id (admin cleanup, e2e teardown)", () => {
  it("admin deletes a promotion; unknown id 404; users and partner keys cannot (403 / 401)", async () => {
    prismaMock.promotion.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect((await request(app).delete("/promotions/p1").set(ADMIN)).body).toEqual({ deleted: 1 });
    expect(prismaMock.promotion.deleteMany).toHaveBeenLastCalledWith({ where: { id: "p1" } });
    expect((await request(app).delete("/promotions/missing").set(ADMIN)).status).toBe(404);
    expect((await request(app).delete("/promotions/p1").set(USER_A)).status).toBe(403);
    expect((await request(app).delete("/promotions/p1").set("x-api-key", KEY)).status).toBe(401);
    expect(prismaMock.promotion.deleteMany).toHaveBeenCalledTimes(2);
  });
});

describe("Thông báo multi-select delete and dismissals", () => {
  const USER_B = { "x-user-id": "u2", "x-user-role": "USER" };
  type Row = { id: string; userId: string; type: string; data: Record<string, unknown> };
  type Where = { id: { in: string[] }; userId: string; type?: string };
  // In-memory rows of two users; deleteMany honours the id list and the userId scope like Postgres.
  const table = (): Row[] => [
    { id: "a-order", userId: "u1", type: "SYSTEM", data: { type: "order", orderId: "o1" } },
    { id: "a-promo", userId: "u1", type: "PROMOTION", data: { promotionId: "p1" } },
    { id: "b-order", userId: "u2", type: "SYSTEM", data: { type: "order", orderId: "o2" } },
  ];
  let rows = table();
  const matches = (where: Where) => (row: Row) => where.id.in.includes(row.id) && row.userId === where.userId && (!where.type || row.type === where.type);
  beforeEach(() => {
    rows = table();
    prismaMock.notification.findMany.mockImplementation(async ({ where }: { where: Where }) => rows.filter(matches(where)));
    prismaMock.notification.deleteMany.mockImplementation(async ({ where }: { where: Where }) => {
      const before = rows.length;
      rows = rows.filter((row) => !matches(where)(row));
      return { count: before - rows.length };
    });
    prismaMock.notificationDismissal.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
    prismaMock.notificationDismissal.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("deletes only the caller's own rows in one request; other users' ids are skipped silently", async () => {
    const response = await request(app).post("/notifications/delete").set(USER_A).send({ ids: ["a-order", "b-order", "unknown"] });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ deleted: 1 });
    expect(rows.map((row) => row.id)).toEqual(["a-promo", "b-order"]);
    expect(prismaMock.notification.deleteMany.mock.calls[0][0].where).toMatchObject({ userId: "u1" });
  });

  it("is idempotent: deleting the same ids again answers 200 with 0", async () => {
    await request(app).post("/notifications/delete").set(USER_A).send({ ids: ["a-order"] });
    const again = await request(app).post("/notifications/delete").set(USER_A).send({ ids: ["a-order"] });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ deleted: 0 });
  });

  it("user B cannot delete user A's notifications", async () => {
    const response = await request(app).post("/notifications/delete").set(USER_B).send({ ids: ["a-order", "a-promo"] });
    expect(response.body).toEqual({ deleted: 0 });
    expect(rows).toHaveLength(3);
    expect(prismaMock.notificationDismissal.createMany).not.toHaveBeenCalled();
  });

  it("a deleted promotion row is remembered for the caller so the feed does not make it again", async () => {
    await request(app).post("/notifications/delete").set(USER_A).send({ ids: ["a-promo"] });
    expect(prismaMock.notificationDismissal.createMany).toHaveBeenCalledWith({ data: [{ userId: "u1", key: "promotion:p1" }], skipDuplicates: true });
  });

  it("validates the id list (empty or over 200 ids is 400)", async () => {
    expect((await request(app).post("/notifications/delete").set(USER_A).send({ ids: [] })).status).toBe(400);
    expect((await request(app).post("/notifications/delete").set(USER_A).send({ ids: Array.from({ length: 201 }, (_, index) => `n${index}`) })).status).toBe(400);
  });

  it("stores dismissal keys for the caller only (deduplicated) and lists them back", async () => {
    const saved = await request(app).post("/notifications/dismissals").set(USER_A).send({ keys: ["week:2026-11-23", "expiry:item-1:2026-11-28:1-ngay", "week:2026-11-23"] });
    expect(saved.status).toBe(200);
    expect(prismaMock.notificationDismissal.createMany).toHaveBeenCalledWith({ data: [{ userId: "u1", key: "week:2026-11-23" }, { userId: "u1", key: "expiry:item-1:2026-11-28:1-ngay" }], skipDuplicates: true });
    prismaMock.notificationDismissal.findMany.mockResolvedValue([{ key: "week:2026-11-23" }]);
    const listed = await request(app).get("/notifications/dismissals").set(USER_A);
    expect(listed.body).toEqual({ keys: ["week:2026-11-23"] });
    expect(prismaMock.notificationDismissal.findMany.mock.calls[0][0].where).toEqual({ userId: "u1" });
  });

  it("rejects unknown dismissal key kinds", async () => {
    expect((await request(app).post("/notifications/dismissals").set(USER_A).send({ keys: ["order:o1"] })).status).toBe(400);
  });
});

describe("finished order notices leave the feed 72 h after their last status", () => {
  const NOW = new Date("2026-11-27T05:00:00.000Z"); // 12:00 in Vietnam
  const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);
  type Row = { id: string; userId: string; status: string; dedupeKey: string | null; createdAt: Date; data: Record<string, unknown> | null };
  let rows: Row[] = [];
  /** Evaluates the Prisma where this route builds, enough for these rows (userId, status, NOT, OR on data.status). */
  type Where = Record<string, any>;
  const matches = (row: Row, where: Where): boolean => Object.entries(where).every(([field, condition]) => {
    if (condition === undefined) return true;
    if (field === "NOT") return !matches(row, condition);
    if (field === "OR") return (condition as Where[]).some((entry) => matches(row, entry));
    if (field === "data") return (row.data as Record<string, unknown> | null)?.[condition.path[0]] === condition.equals;
    const value = (row as Record<string, unknown>)[field];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("not" in condition && condition.not === null && value === null) return false;
      if ("startsWith" in condition && !(typeof value === "string" && value.startsWith(condition.startsWith))) return false;
      if ("lte" in condition && !((value as Date) <= condition.lte)) return false;
      return true;
    }
    return value === condition;
  });
  const order = (id: string, userId: string, status: string, hours: number, read = false): Row =>
    ({ id, userId, status: read ? "READ" : "SENT", dedupeKey: `order:${id}`, createdAt: hoursAgo(hours), data: { type: "order", orderId: id, status } });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    rows = [
      order("delivered-72h", "u1", "DELIVERED", 72),
      order("failed-80h", "u1", "FAILED", 80, true),
      order("cancelled-71h", "u1", "CANCELLED", 71),
      order("shipping-200h", "u1", "SHIPPING", 200),
      { id: "system-old", userId: "u1", status: "SENT", dedupeKey: null, createdAt: hoursAgo(500), data: null },
      order("other-user-delivered-100h", "u2", "DELIVERED", 100),
    ];
    prismaMock.notification.findMany.mockImplementation(async ({ where }: { where: Where }) => rows.filter((row) => matches(row, where)));
    prismaMock.notification.count.mockImplementation(async ({ where }: { where: Where }) => rows.filter((row) => matches(row, where)).length);
    prismaMock.notification.deleteMany.mockImplementation(async ({ where }: { where: Where }) => {
      const before = rows.length;
      rows = rows.filter((row) => !matches(row, where));
      return { count: before - rows.length };
    });
  });
  afterEach(() => { vi.useRealTimers(); });

  it("hidden at 72 h, visible at 71 h; SHIPPING and non-order rows are never auto-removed", async () => {
    const response = await request(app).get("/notifications").set(USER_A);
    expect(response.body.items.map((row: Row) => row.id).sort()).toEqual(["cancelled-71h", "shipping-200h", "system-old"]);
    expect(response.body.total).toBe(3);
  });

  it("the expired rows are deleted during the read (idempotent), only the caller's", async () => {
    await request(app).get("/notifications").set(USER_A);
    expect(rows.map((row) => row.id).sort()).toEqual(["cancelled-71h", "other-user-delivered-100h", "shipping-200h", "system-old"]);
    expect(prismaMock.notification.deleteMany.mock.calls[0][0].where).toMatchObject({ userId: "u1" });
    await request(app).get("/notifications").set(USER_A);
    expect(rows).toHaveLength(4);
  });

  it("the bell badge count (status=SENT) excludes expired notices", async () => {
    prismaMock.notification.deleteMany.mockRejectedValue(new Error("db busy")); // even when the cleanup fails
    const response = await request(app).get("/notifications?status=SENT&limit=1").set(USER_A);
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(3); // cancelled-71h, shipping-200h, system-old (delivered-72h is expired)
  });

  it("a status change resets the clock: the replaced row is visible again", async () => {
    rows[0] = { ...rows[0], createdAt: hoursAgo(1), data: { type: "order", orderId: "delivered-72h", status: "FAILED" } };
    const response = await request(app).get("/notifications").set(USER_A);
    expect(response.body.items.map((row: Row) => row.id)).toContain("delivered-72h");
  });
});
