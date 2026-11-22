import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import express from "express";
import { PrismaClient } from ".prisma/client-family";
import { createInternalFamiliesRouter } from "./internal-families.routes";

test("internal family members route: key required, 404 unknown family, members with names", async () => {
  const familyId = "22222222-2222-2222-2222-222222222222";
  const ownerId = "33333333-3333-3333-3333-333333333333";
  const memberId = "44444444-4444-4444-4444-444444444444";
  const prisma = {
    familyGroup: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === familyId
        ? { members: [{ userId: ownerId }, { userId: memberId }] }
        : null),
    },
  } as unknown as PrismaClient;

  let forwardedKey: string | undefined;
  const profiles = createServer((req, res) => {
    forwardedKey = req.headers["x-api-key"] as string | undefined;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ items: [
      { id: ownerId, email: "owner@example.com", name: "Owner" },
      { id: memberId, email: "member@example.com", name: null },
    ] }));
  });
  await new Promise<void>((resolve) => profiles.listen(0, "127.0.0.1", resolve));
  const profileAddress = profiles.address();
  if (!profileAddress || typeof profileAddress === "string") throw new Error("No profile test port");

  const oldTarget = process.env.AUTH_SERVICE_URL;
  const oldKey = process.env.INTERNAL_API_KEY;
  const key = "test-internal-key-with-more-than-32-characters";
  process.env.INTERNAL_API_KEY = key;
  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${profileAddress.port}`;
  const app = express();
  app.use("/internal/families", createInternalFamiliesRouter(prisma));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const url = (path: string) => `http://127.0.0.1:${address.port}${path}`;

  try {
    const noKey = await fetch(url(`/internal/families/${familyId}/members`));
    assert.equal(noKey.status, 403);
    const wrongKey = await fetch(url(`/internal/families/${familyId}/members`), { headers: { "x-api-key": "wrong" } });
    assert.equal(wrongKey.status, 403);

    const badId = await fetch(url("/internal/families/not-a-uuid/members"), { headers: { "x-api-key": key } });
    assert.equal(badId.status, 400);

    const unknown = await fetch(url("/internal/families/55555555-5555-5555-5555-555555555555/members"), { headers: { "x-api-key": key } });
    assert.equal(unknown.status, 404);

    const ok = await fetch(url(`/internal/families/${familyId}/members`), { headers: { "x-api-key": key } });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { items: [{ userId: ownerId, name: "Owner" }, { userId: memberId, name: null }] });
    assert.equal(forwardedKey, key);

    process.env.INTERNAL_API_KEY = "";
    const notConfigured = await fetch(url(`/internal/families/${familyId}/members`), { headers: { "x-api-key": key } });
    assert.equal(notConfigured.status, 503);
  } finally {
    process.env.AUTH_SERVICE_URL = oldTarget;
    process.env.INTERNAL_API_KEY = oldKey;
    server.close();
    profiles.close();
  }
});
