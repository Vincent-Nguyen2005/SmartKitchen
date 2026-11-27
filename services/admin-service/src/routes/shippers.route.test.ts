import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createShippersRouter } from "./shippers.route";

const PASSWORD = "Giaohang1"; // test-only value
const ADMIN = { "x-user-id": "admin-1", "x-user-role": "ADMIN" };
const USER = { "x-user-id": "user-1", "x-user-role": "USER" };
const shipper = { id: "00000000-0000-4000-8000-000000000001", name: "An", phone: "0901234567", email: "an@example.com", active: true, createdAt: "2026-11-27T00:00:00.000Z" };

const audit = vi.fn();
const calls: Array<{ url: string; method: string; body: unknown }> = [];
const reply = (status: number, body: unknown) => ({ status, json: async () => body }) as Response;
const fakeFetch = vi.fn(async (url: string, init: RequestInit) => {
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ url, method: init.method ?? "GET", body });
  if (url.endsWith("/internal/admin/shippers") && init.method === "POST") return reply(201, { shipper });
  if (url.includes("/internal/admin/shippers?") || url.endsWith("/internal/admin/shippers")) return reply(200, { items: [shipper, { ...shipper, id: "00000000-0000-4000-8000-000000000002", active: false }] });
  if (url.includes("/internal/shippers/stats")) return reply(200, { items: [{ shipperId: shipper.id, delivered: 12 }] });
  if (url.endsWith("/status")) return reply(200, { shipper: { ...shipper, active: body.active } });
  if (url.endsWith("/release")) return reply(200, { released: 2 });
  if (url.endsWith("/password")) return reply(200, { shipper });
  return reply(404, {});
});

const app = express();
app.use(express.json());
app.use(createShippersRouter({ auditLog: { create: audit } } as never, fakeFetch as unknown as typeof fetch));

beforeEach(() => {
  audit.mockReset();
  calls.length = 0;
  process.env.INTERNAL_API_KEY = "test-internal-key-with-more-than-32-characters";
});

describe("Quản trị › Người giao hàng", () => {
  it("admins only: users get 403 and nothing is called", async () => {
    expect((await request(app).get("/shippers").set(USER)).status).toBe(403);
    expect((await request(app).post("/shippers").set(USER).send({ password: PASSWORD })).status).toBe(403);
    expect((await request(app).get("/shippers")).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("lists shippers with their delivered-order counts", async () => {
    const response = await request(app).get("/shippers").set(ADMIN);
    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { deliveredCount: number }) => item.deliveredCount)).toEqual([12, 0]);
  });

  it("create: forwards to auth-service; the audit row never contains the password", async () => {
    const response = await request(app).post("/shippers").set(ADMIN).send({ name: "An", phone: "0901234567", email: "an@example.com", password: PASSWORD });
    expect(response.status).toBe(201);
    expect(JSON.stringify(response.body)).not.toContain(PASSWORD);
    expect(audit).toHaveBeenCalledTimes(1);
    const entry = audit.mock.calls[0][0].data;
    expect(entry).toMatchObject({ adminUserId: "admin-1", action: "SHIPPER_CREATE", targetType: "ShipperAccount", targetId: shipper.id });
    expect(JSON.stringify(entry)).not.toContain(PASSWORD);
  });

  it("disable: the shipper's SHIPPING orders are released back to PENDING; audited", async () => {
    const response = await request(app).patch(`/shippers/${shipper.id}/status`).set(ADMIN).send({ active: false });
    expect(response.body).toMatchObject({ shipper: { active: false }, releasedOrders: 2 });
    expect(calls.map((call) => call.url.replace(/^http:\/\/[^/]+/, ""))).toEqual([`/internal/admin/shippers/${shipper.id}/status`, `/internal/shippers/${shipper.id}/release`]);
    expect(audit.mock.calls[0][0].data).toMatchObject({ action: "SHIPPER_DISABLE", metadata: { releasedOrders: 2 } });
    calls.length = 0;
    await request(app).patch(`/shippers/${shipper.id}/status`).set(ADMIN).send({ active: true });
    expect(calls.some((call) => call.url.endsWith("/release"))).toBe(false);
  });

  it("reset password: audited without the password", async () => {
    const response = await request(app).post(`/shippers/${shipper.id}/password`).set(ADMIN).send({ password: PASSWORD });
    expect(response.status).toBe(200);
    expect(audit.mock.calls[0][0].data).toEqual({ adminUserId: "admin-1", action: "SHIPPER_PASSWORD_RESET", targetType: "ShipperAccount", targetId: shipper.id, metadata: {} });
  });
});
