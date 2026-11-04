import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp, isInternalPath } from "./app";
import { clearResponseCache } from "./middleware/cache";

const SECRET = "gateway-test-secret";
let upstream: Server;
let upstreamHits = 0;
const envKeys = ["NOTIFICATION_SERVICE_URL", "ADMIN_SERVICE_URL"];
const savedEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  const app = express();
  app.use((req, res) => {
    upstreamHits++;
    res.json({ path: req.originalUrl, userId: req.headers["x-user-id"] ?? null, role: req.headers["x-user-role"] ?? null, authorization: req.headers.authorization ?? null });
  });
  upstream = await new Promise<Server>((resolve) => { const server = app.listen(0, () => resolve(server)); });
  const url = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  for (const key of envKeys) { savedEnv[key] = process.env[key]; process.env[key] = url; }
});

afterAll(async () => {
  for (const key of envKeys) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
  await new Promise((resolve) => upstream.close(resolve));
});

beforeEach(() => { clearResponseCache(); upstreamHits = 0; });

const token = (role = "USER") => jwt.sign({ email: "u@example.com", role }, SECRET, { subject: "user-42", expiresIn: "15m" });

describe("gateway authentication end to end", () => {
  it("forwards the verified identity and the original Authorization header to the service", async () => {
    const bearer = `Bearer ${token("ADMIN")}`;
    const response = await request(createApp({ jwtSecret: SECRET })).get("/api/admin/reports").set("authorization", bearer).set("x-user-role", "USER");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ path: "/reports", userId: "user-42", role: "ADMIN", authorization: bearer });
  });

  it("does not let an anonymous caller forge the admin role", async () => {
    const response = await request(createApp({ jwtSecret: SECRET })).get("/api/admin/reports").set("x-user-id", "victim").set("x-user-role", "ADMIN");
    expect(response.body).toMatchObject({ userId: null, role: null });
  });

  it("answers 401 before proxying when the token is invalid", async () => {
    const response = await request(createApp({ jwtSecret: SECRET })).get("/api/admin/reports/mine").set("authorization", "Bearer forged.token.value");
    expect(response.status).toBe(401);
    expect(upstreamHits).toBe(0);
  });

  it("never caches Bearer requests even on cacheable public routes", async () => {
    const app = createApp({ jwtSecret: SECRET });
    const bearer = `Bearer ${token()}`;
    const first = await request(app).get("/api/notifications/promotions").set("authorization", bearer);
    const second = await request(app).get("/api/notifications/promotions").set("authorization", bearer);
    expect(first.headers["x-cache"]).toBe("BYPASS");
    expect(second.headers["x-cache"]).toBe("BYPASS");
    expect(upstreamHits).toBe(2);
  });

  it("never caches account report routes, even anonymous GETs", async () => {
    const app = createApp({ jwtSecret: SECRET });
    const first = await request(app).get("/api/admin/reports/mine");
    await request(app).get("/api/admin/reports/mine");
    expect(first.headers["x-cache"]).toBe("BYPASS");
    expect(upstreamHits).toBe(2);
  });

  it("hides service-internal endpoints behind 404", async () => {
    const response = await request(createApp({ jwtSecret: SECRET })).post("/api/notifications/internal/notifications").send({ userId: "u" });
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("ROUTE_NOT_FOUND");
    expect(upstreamHits).toBe(0);
  });

  it("matches internal paths per service prefix only", () => {
    expect(isInternalPath("/api/notifications/internal/notifications")).toBe(true);
    expect(isInternalPath("/api/admin/internal")).toBe(true);
    expect(isInternalPath("/api/notifications/notifications")).toBe(false);
    expect(isInternalPath("/api/recipes/internal-tips")).toBe(false);
  });
});
