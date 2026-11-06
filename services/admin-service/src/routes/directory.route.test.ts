import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import directoryRouter from "./directory.route";

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
    expect((await request(app).get("/users")).status).toBe(403);
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
