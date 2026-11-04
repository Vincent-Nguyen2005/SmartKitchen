import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { gatewayRoutes, getTarget } from "./config/routes";
import { createApp } from "./app";
import { clearResponseCache } from "./middleware/cache";

let upstream: Server;
let upstreamUrl = "";
let hangingUpstream: Server;
let hangingUrl = "";
const savedEnv = { ...process.env };

const listen = (app: express.Express) => new Promise<Server>((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
const urlOf = (server: Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const pointAllRoutesAt = (url: string) => { for (const route of gatewayRoutes) process.env[route.envKey] = url; };

beforeAll(async () => {
  const app = express();
  app.get("/health", (_req, res) => res.json({ status: "OK" }));
  app.get("/big", (_req, res) => res.json({ items: Array.from({ length: 2000 }, (_, index) => ({ index, name: `item-${index}` })) }));
  app.post("/echo", (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => res.json({ body: Buffer.concat(chunks).toString("utf8"), contentType: req.headers["content-type"], requestId: req.headers["x-request-id"] }));
  });
  app.use((req, res) => res.json({ path: req.originalUrl, requestId: req.headers["x-request-id"] ?? null }));
  upstream = await listen(app);
  upstreamUrl = urlOf(upstream);
  const hanging = express();
  hanging.use(() => undefined); // never responds
  hangingUpstream = await listen(hanging);
  hangingUrl = urlOf(hangingUpstream);
});

afterAll(async () => {
  process.env = savedEnv;
  hangingUpstream.closeAllConnections();
  await Promise.all([upstream, hangingUpstream].map((server) => new Promise((resolve) => server.close(resolve))));
});

beforeEach(() => { clearResponseCache(); pointAllRoutesAt(upstreamUrl); });

describe("route table", () => {
  it("maps 11 unique /api prefixes to services on ports 4001-4011", () => {
    expect(gatewayRoutes).toHaveLength(11);
    expect(new Set(gatewayRoutes.map((route) => route.prefix)).size).toBe(11);
    expect(new Set(gatewayRoutes.map((route) => route.envKey)).size).toBe(11);
    gatewayRoutes.forEach((route, index) => {
      expect(route.prefix.startsWith("/api/")).toBe(true);
      expect(route.envKey).toMatch(/^[A-Z_]+_SERVICE_URL$/);
      expect(route.defaultTarget).toBe(`http://localhost:${4001 + index}`);
    });
  });

  it("uses the env override when set and the localhost default otherwise", () => {
    const auth = gatewayRoutes[0];
    process.env.AUTH_SERVICE_URL = "http://auth-service:4001";
    expect(getTarget(auth)).toBe("http://auth-service:4001");
    delete process.env.AUTH_SERVICE_URL;
    expect(getTarget(auth)).toBe("http://localhost:4001");
  });
});

describe("proxying", () => {
  it("strips the service prefix before forwarding", async () => {
    const response = await request(createApp({ jwtSecret: null })).get("/api/recipes/items/42?x=1");
    expect(response.status).toBe(200);
    expect(response.body.path).toBe("/items/42?x=1");
  });

  it("propagates an incoming x-request-id to the service and the response", async () => {
    const response = await request(createApp({ jwtSecret: null })).get("/api/menus/today").set("x-request-id", "req-123");
    expect(response.headers["x-request-id"]).toBe("req-123");
    expect(response.body.requestId).toBe("req-123");
  });

  it("generates a request id when the client sends none", async () => {
    const response = await request(createApp({ jwtSecret: null })).get("/api/menus/today");
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body.requestId).toBe(response.headers["x-request-id"]);
  });

  it("forwards a JSON POST body byte-for-byte", async () => {
    const payload = JSON.stringify({ name: "Cà chua", qty: 2, nested: { ok: true } });
    const response = await request(createApp({ jwtSecret: null })).post("/api/inventory/echo").set("content-type", "application/json").send(payload);
    expect(response.status).toBe(200);
    expect(response.body.body).toBe(payload);
    expect(response.body.contentType).toContain("application/json");
  });

  it("keeps large proxied responses intact with gzip compression", async () => {
    const response = await request(createApp({ jwtSecret: null })).get("/api/recipes/big").set("accept-encoding", "gzip");
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2000);
    expect(response.body.items[1999]).toEqual({ index: 1999, name: "item-1999" });
  });

  it("answers 503 SERVICE_UNAVAILABLE without a stack trace when the service is down", async () => {
    process.env.PAYMENT_SERVICE_URL = "http://127.0.0.1:1";
    const response = await request(createApp({ jwtSecret: null })).get("/api/payments/orders");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "SERVICE_UNAVAILABLE", service: "payment-service" });
    expect(response.text).not.toMatch(/\bat\s.+\(.+:\d+:\d+\)/);
  });
});

describe("/api/health aggregation", () => {
  it("returns 200 OK when every service is UP", async () => {
    const response = await request(createApp({ jwtSecret: null })).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("OK");
    expect(Object.keys(response.body.services)).toHaveLength(11);
    expect(Object.values(response.body.services).every((status) => status === "UP")).toBe(true);
  });

  it("returns 503 DEGRADED and marks the unreachable service DOWN", async () => {
    process.env.MENU_SERVICE_URL = "http://127.0.0.1:1";
    const response = await request(createApp({ jwtSecret: null })).get("/api/health");
    expect(response.status).toBe(503);
    expect(response.body.status).toBe("DEGRADED");
    expect(response.body.services["menu-service"]).toBe("DOWN");
    expect(response.body.services["auth-service"]).toBe("UP");
  });

  it("marks a service that does not answer within 2s as DOWN", async () => {
    process.env.RECIPE_SERVICE_URL = hangingUrl;
    const started = Date.now();
    const response = await request(createApp({ jwtSecret: null })).get("/api/health");
    expect(response.body.services["recipe-service"]).toBe("DOWN");
    expect(Date.now() - started).toBeLessThan(4000);
  }, 8000);
});

describe("rate limiting", () => {
  it("returns 429 JSON after the limit but never limits health checks", async () => {
    vi.resetModules();
    process.env.RATE_LIMIT_MAX = "3";
    const { createApp: createLimitedApp } = await import("./app");
    const app = createLimitedApp({ jwtSecret: null });
    for (let index = 0; index < 3; index++) expect((await request(app).get("/api/menus/x")).status).toBe(200);
    const limited = await request(app).get("/api/menus/x");
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ error: "RATE_LIMITED", retryAfterSeconds: 60 });
    expect(limited.headers["ratelimit-policy"] ?? limited.headers.ratelimit).toBeDefined();
    expect((await request(app).get("/api/health")).status).toBe(200);
    expect((await request(app).get("/health")).status).toBe(200);
    delete process.env.RATE_LIMIT_MAX;
  });
});
