import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { PrismaClient, Role } from ".prisma/client-auth";
import { createAdminUsersRouter } from "./admin-users.routes";

test("admin users API checks role, paginates and never returns credentials", async () => {
  const adminId = "11111111-1111-1111-1111-111111111111";
  const userId = "22222222-2222-2222-2222-222222222222";
  const oldKey = process.env.INTERNAL_API_KEY;
  process.env.INTERNAL_API_KEY = "test-internal-key-with-more-than-32-characters";
  const headers = { "x-api-key": process.env.INTERNAL_API_KEY };
  let findManyArgs: Record<string, unknown> | undefined;
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => ({ role: where.id === adminId ? Role.ADMIN : Role.USER }),
      findMany: async (args: Record<string, unknown>) => {
        findManyArgs = args;
        return [{ id: userId, email: "member@example.com", fullName: "Member", avatarUrl: "https://example.com/avatar.jpg", role: Role.USER,
          isVerified: true, createdAt: new Date("2026-01-01"), passwordHash: "must-not-leak", token: "must-not-leak" }];
      },
      count: async () => 1,
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  } as unknown as PrismaClient;
  const app = express();
  app.use(express.json());
  app.use("/internal/admin/users", createAdminUsersRouter(prisma));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const base = `http://127.0.0.1:${address.port}/internal/admin/users`;
  try {
    const regular = await fetch(base, { headers: { "x-api-key": "invalid" } });
    assert.equal(regular.status, 403);
    assert.equal((await fetch(base)).status, 403);
    const invalidLimit = await fetch(`${base}?limit=101`, { headers });
    assert.equal(invalidLimit.status, 400);
    assert.equal((await fetch(`${base}?role=OWNER`, { headers })).status, 400);
    const response = await fetch(`${base}?page=2&limit=10&q=member&role=USER`, {
      headers,
    });
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.deepEqual(body, { items: [{ id: userId, email: "member@example.com", name: "Member", role: "USER",
      emailVerified: true, createdAt: "2026-01-01T00:00:00.000Z" }], total: 1, page: 2, limit: 10 });
    assert.equal(findManyArgs?.skip, 10);
    assert.equal(findManyArgs?.take, 10);
    assert.equal((findManyArgs?.where as { role?: string }).role, "USER");
    const profiles = await fetch(`${base}/profiles`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [userId] }),
    });
    assert.equal(profiles.status, 200);
    assert.deepEqual(await profiles.json(), { items: [{ id: userId, email: "member@example.com", name: "Member", avatarUrl: "https://example.com/avatar.jpg" }] });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (oldKey === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = oldKey;
  }
});

test("admin users return 503 when the auth database is unavailable", async () => {
  const oldKey = process.env.INTERNAL_API_KEY;
  process.env.INTERNAL_API_KEY = "test-internal-key-with-more-than-32-characters";
  const outage = Object.assign(new Error("Database unavailable"), { code: "P1001" });
  let profilesDown = false;
  const prisma = {
    user: { findMany: async () => { if (profilesDown) throw outage; return []; }, count: async () => 0 },
    $transaction: async () => { throw outage; },
  } as unknown as PrismaClient;
  const app = express();
  app.use(express.json());
  app.use("/internal/admin/users", createAdminUsersRouter(prisma));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const base = `http://127.0.0.1:${address.port}/internal/admin/users`;
  const headers = { "x-api-key": process.env.INTERNAL_API_KEY };
  try {
    const list = await fetch(base, { headers });
    assert.equal(list.status, 503);
    assert.deepEqual(await list.json(), { error: "SERVICE_UNAVAILABLE", message: "Auth database is unavailable" });
    profilesDown = true;
    const profiles = await fetch(`${base}/profiles`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["22222222-2222-2222-2222-222222222222"] }),
    });
    assert.equal(profiles.status, 503);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (oldKey === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = oldKey;
  }
});
