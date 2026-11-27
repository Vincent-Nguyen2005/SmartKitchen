import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import directoryRouter, { familyDetailView, familyListView } from "./directory.route";

const previous = {
  key: process.env.INTERNAL_API_KEY,
  auth: process.env.AUTH_SERVICE_URL,
  family: process.env.FAMILY_SERVICE_URL,
};
afterEach(() => {
  for (const [key, value] of Object.entries({ INTERNAL_API_KEY: previous.key, AUTH_SERVICE_URL: previous.auth, FAMILY_SERVICE_URL: previous.family })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

it("only routes ADMIN requests to internal services with the API key", async () => {
  const seen: Array<{ path: string | undefined; key: string | undefined }> = [];
  const upstream = createServer((req, res) => {
    seen.push({ path: req.url, key: req.headers["x-api-key"] as string | undefined });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ items: [], total: 0, page: 1, limit: 20 }));
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const target = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  process.env.INTERNAL_API_KEY = "test-internal-key-with-more-than-32-characters";
  process.env.AUTH_SERVICE_URL = target;
  process.env.FAMILY_SERVICE_URL = target;
  const app = express().use(directoryRouter);
  try {
    expect((await request(app).get("/users")).status).toBe(401);
    expect((await request(app).get("/users").set({ "x-user-role": "USER", "x-user-id": "user-1" })).status).toBe(403);
    const headers = { "x-user-role": "ADMIN", "x-user-id": "admin-1" };
    expect((await request(app).get("/users?page=2").set(headers)).status).toBe(200);
    expect((await request(app).get("/families?limit=10").set(headers)).status).toBe(200);
    expect((await request(app).get("/families/abc").set(headers)).status).toBe(200);
    expect(seen).toEqual([
      { path: "/internal/admin/users?page=2", key: process.env.INTERNAL_API_KEY },
      { path: "/internal/admin/families?limit=10", key: process.env.INTERNAL_API_KEY },
      { path: "/internal/admin/families/abc", key: process.env.INTERNAL_API_KEY },
    ]);
  } finally {
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

const adminHeaders = { "x-user-role": "ADMIN", "x-user-id": "admin-1" };

it("answers 503 when the upstream refuses the connection (ECONNREFUSED)", async () => {
  // Bind then close a port so nothing is listening on it.
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  process.env.INTERNAL_API_KEY = "test-internal-key-with-more-than-32-characters";
  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${port}`;
  const response = await request(express().use(directoryRouter)).get("/users").set(adminHeaders);
  expect(response.status).toBe(503);
  expect(response.body.error).toBe("UPSTREAM_UNAVAILABLE");
});

it("answers 502 when the upstream responds with a non-JSON body", async () => {
  const upstream = createServer((_req, res) => { res.statusCode = 500; res.end("<html>oops</html>"); });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  process.env.INTERNAL_API_KEY = "test-internal-key-with-more-than-32-characters";
  process.env.FAMILY_SERVICE_URL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  try {
    const response = await request(express().use(directoryRouter)).get("/families").set(adminHeaders);
    expect(response.status).toBe(502);
    expect(response.body.error).toBe("UPSTREAM_BAD_RESPONSE");
  } finally {
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

it("families: only id, name, member count and created date reach the admin (no owner email, no members)", () => {
  const family = { id: "f1", name: "Nhà An", memberCount: 2, ownerEmail: "owner@example.com", createdAt: "2026-11-11T00:00:00.000Z", members: [{ id: "m1", userId: "u1", name: "An", email: "an@example.com", role: "OWNER" }] };
  expect(familyDetailView(family)).toEqual({ id: "f1", name: "Nhà An", memberCount: 2, createdAt: "2026-11-11T00:00:00.000Z" });
  expect(familyListView({ items: [family], total: 1, page: 1, limit: 20 })).toEqual({ items: [{ id: "f1", name: "Nhà An", memberCount: 2, createdAt: "2026-11-11T00:00:00.000Z" }], total: 1, page: 1, limit: 20 });
  expect(familyDetailView({ id: "f2", name: "X", createdAt: "2026-01-01T00:00:00.000Z", members: [{}, {}, {}] }).memberCount).toBe(3);
  // Error bodies are not reshaped.
  expect(familyDetailView({ error: "NOT_FOUND" })).toEqual({ error: "NOT_FOUND" });
});
