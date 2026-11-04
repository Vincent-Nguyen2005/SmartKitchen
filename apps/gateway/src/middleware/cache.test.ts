import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { clearResponseCache, responseCache } from "./cache";

describe("response cache", () => {
  beforeEach(() => clearResponseCache());

  it("returns MISS then HIT for public notification promotions", async () => {
    const app = express(); app.use(responseCache); app.get("/api/notifications/promotions", (_request, response) => response.json({ items: [] }));
    const first = await request(app).get("/api/notifications/promotions?active=true");
    const second = await request(app).get("/api/notifications/promotions?active=true");
    expect(first.status).toBe(200); expect(first.headers["x-cache"]).toBe("MISS");
    expect(second.status).toBe(200); expect(second.headers["x-cache"]).toBe("HIT");
  });

  it("bypasses authenticated GET and POST requests", async () => {
    const app = express(); app.use(responseCache); app.get("/api/notifications/promotions", (_request, response) => response.json({ items: [] })); app.post("/api/notifications/promotions", (_request, response) => response.json({ ok: true }));
    expect((await request(app).get("/api/notifications/promotions").set("authorization", "Bearer test")).headers["x-cache"]).toBe("BYPASS");
    expect((await request(app).post("/api/notifications/promotions")).headers["x-cache"]).toBe("BYPASS");
  });

  it("does not cache 5xx responses", async () => {
    const app = express(); app.use(responseCache); app.get("/api/notifications/promotions", (_request, response) => response.status(503).json({ error: "DATABASE_UNAVAILABLE" }));
    const first = await request(app).get("/api/notifications/promotions"); const second = await request(app).get("/api/notifications/promotions");
    expect(first.status).toBe(503); expect(second.status).toBe(503); expect(first.headers["x-cache"]).toBe("MISS"); expect(second.headers["x-cache"]).toBe("MISS");
  });
});
