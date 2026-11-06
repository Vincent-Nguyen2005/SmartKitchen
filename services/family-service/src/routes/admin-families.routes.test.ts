import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import express from "express";
import { PrismaClient } from ".prisma/client-family";
import { createAdminFamiliesRouter } from "./admin-families.routes";

test("admin family APIs check role and return owner/member profiles", async () => {
  const adminId = "11111111-1111-1111-1111-111111111111";
  const familyId = "22222222-2222-2222-2222-222222222222";
  const ownerId = "33333333-3333-3333-3333-333333333333";
  const memberId = "44444444-4444-4444-4444-444444444444";
  const createdAt = new Date("2026-01-01");
  let listArgs: Record<string, unknown> | undefined;
  const prisma = {
    familyGroup: {
      findMany: async (args: Record<string, unknown>) => {
        listArgs = args;
        return [{ id: familyId, name: "Home", ownerId, createdAt, _count: { members: 2 } }];
      },
      count: async () => 1,
      findUnique: async () => ({ id: familyId, name: "Home", ownerId, createdAt,
        members: [{ id: "membership-1", userId: ownerId, role: "OWNER" },
          { id: "membership-2", userId: memberId, role: "MEMBER" }] }),
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  } as unknown as PrismaClient;
  let forwardedKey: string | undefined;
  let profileStatus = 200;
  const profiles = createServer((req, res) => {
    forwardedKey = req.headers["x-api-key"] as string | undefined;
    res.statusCode = profileStatus;
    res.setHeader("Content-Type", "application/json");
    if (profileStatus !== 200) {
      res.end(JSON.stringify({ error: "UNAVAILABLE" }));
      return;
    }
    res.end(JSON.stringify({ items: [
      { id: ownerId, email: "owner@example.com", name: "Owner" },
      { id: memberId, email: "member@example.com", name: "Member" },
    ] }));
  });
  await new Promise<void>((resolve) => profiles.listen(0, "127.0.0.1", resolve));
  const profileAddress = profiles.address();
  if (!profileAddress || typeof profileAddress === "string") throw new Error("No profile test port");
  const oldTarget = process.env.AUTH_SERVICE_URL;
  const oldKey = process.env.INTERNAL_API_KEY;
  process.env.INTERNAL_API_KEY = "test-internal-key-with-more-than-32-characters";
  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${profileAddress.port}`;
  const app = express();
  app.use("/internal/admin/families", createAdminFamiliesRouter(prisma));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No family test port");
  const base = `http://127.0.0.1:${address.port}/internal/admin/families`;
  const headers = { "x-api-key": process.env.INTERNAL_API_KEY };
  try {
    assert.equal((await fetch(base, { headers: { "x-api-key": "invalid" } })).status, 403);
    assert.equal((await fetch(`${base}?limit=101`, { headers })).status, 400);
    const list = await fetch(`${base}?page=2&limit=10&q=home`, { headers });
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), { items: [{ id: familyId, name: "Home", memberCount: 2,
      ownerEmail: "owner@example.com", createdAt: "2026-01-01T00:00:00.000Z" }], total: 1, page: 2, limit: 10 });
    assert.equal(listArgs?.skip, 10);
    assert.equal(forwardedKey, process.env.INTERNAL_API_KEY);
    const detail = await fetch(`${base}/${familyId}`, { headers });
    assert.equal(detail.status, 200);
    const body = await detail.json() as { members: Array<{ name: string; email: string; role: string }> };
    assert.deepEqual(body.members.map(({ name, email, role }) => ({ name, email, role })), [
      { name: "Owner", email: "owner@example.com", role: "OWNER" },
      { name: "Member", email: "member@example.com", role: "MEMBER" },
    ]);
    profileStatus = 503;
    const unavailable = await fetch(base, { headers });
    assert.equal(unavailable.status, 502);
    assert.deepEqual(await unavailable.json(), { error: "PROFILE_LOOKUP_FAILED", message: "Unable to load owner profiles" });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => profiles.close(() => resolve()));
    if (oldTarget === undefined) delete process.env.AUTH_SERVICE_URL;
    else process.env.AUTH_SERVICE_URL = oldTarget;
    if (oldKey === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = oldKey;
  }
});
