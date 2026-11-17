import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import express from "express";
import { PrismaClient } from ".prisma/client-family";
import { createFamilyRouter } from "./family.routes";

test("family routes work after the gateway strips /api/families", async () => {
  const oldSecret = process.env.JWT_SECRET;
  const oldTarget = process.env.AUTH_SERVICE_URL;
  const oldKey = process.env.INTERNAL_API_KEY;
  const secret = "family-route-test-secret-with-at-least-32-characters";
  process.env.JWT_SECRET = secret;
  const userId = "11111111-1111-1111-1111-111111111111";
  let databaseDown = false;
  let profileStatus = 200;
  let requestedIds: string[] = [];
  let forwardedKey: string | undefined;
  const profileServer = createServer(async (req, res) => {
    forwardedKey = req.headers["x-api-key"] as string | undefined;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requestedIds = (JSON.parse(Buffer.concat(chunks).toString()) as { ids: string[] }).ids;
    res.statusCode = profileStatus;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ items: [{ id: userId, email: "testuser@example.com", name: "testuser" }] }));
  });
  await new Promise<void>((resolve) => profileServer.listen(0, "127.0.0.1", resolve));
  const profileAddress = profileServer.address();
  if (!profileAddress || typeof profileAddress === "string") throw new Error("No profile test port");
  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${profileAddress.port}`;
  process.env.INTERNAL_API_KEY = "test-internal-key-with-more-than-32-characters";
  const prisma = {
    familyMember: {
      findFirst: async () => {
        if (databaseDown) throw Object.assign(new Error("Database unavailable"), { code: "P1001" });
        return { role: "OWNER", family: { id: "22222222-2222-2222-2222-222222222222", name: "Home", members: [{ id: "membership-1", userId, role: "OWNER" }] } };
      },
    },
  } as unknown as PrismaClient;
  const router = createFamilyRouter(prisma);
  const app = express();
  app.use("/api/family", router);
  app.use("/", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const base = `http://127.0.0.1:${address.port}`;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const signed = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, exp: Math.floor(Date.now() / 1000) + 60 })}`;
  const token = `${signed}.${createHmac("sha256", secret).update(signed).digest("base64url")}`;
  const headers = { Authorization: `Bearer ${token}` };
  try {
    assert.equal((await fetch(`${base}/me`)).status, 401);
    assert.equal((await fetch(`${base}/me`, { headers: { Authorization: "Bearer invalid" } })).status, 401);
    const gatewayPath = await fetch(`${base}/me`, { headers });
    assert.equal(gatewayPath.status, 200);
    const family = (await gatewayPath.json() as { data: { family: { currentUserRole: string; members: Array<{ displayName: string; email: string; role: string }> } } }).data.family;
    assert.equal(family.currentUserRole, "OWNER");
    assert.deepEqual(family.members.map(({ displayName, email, role }) => ({ displayName, email, role })),
      [{ displayName: "testuser", email: "testuser@example.com", role: "OWNER" }]);
    assert.deepEqual(requestedIds, [userId]);
    assert.equal(forwardedKey, process.env.INTERNAL_API_KEY);
    assert.equal((await fetch(`${base}/api/family/me`, { headers })).status, 200);
    assert.equal((await fetch(`${base}/unknown`)).status, 404);
    profileStatus = 503;
    const unavailable = await fetch(`${base}/me`, { headers });
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { error: "SERVICE_UNAVAILABLE", message: "Unable to load member profiles" });
    profileStatus = 200;
    databaseDown = true;
    const outage = await fetch(`${base}/me`, { headers });
    assert.equal(outage.status, 503);
    assert.deepEqual(await outage.json(), { error: "SERVICE_UNAVAILABLE", message: "Family database is unavailable" });
    const authorizationOutage = await fetch(`${base}/settings`, {
      method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ currency: "USD" }),
    });
    assert.equal(authorizationOutage.status, 503);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => profileServer.close(() => resolve()));
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
    if (oldTarget === undefined) delete process.env.AUTH_SERVICE_URL;
    else process.env.AUTH_SERVICE_URL = oldTarget;
    if (oldKey === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = oldKey;
  }
});
