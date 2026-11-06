import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import express from "express";
import { PrismaClient } from ".prisma/client-family";
import { createFamilyRouter } from "./family.routes";

test("family routes work after the gateway strips /api/families", async () => {
  const oldSecret = process.env.JWT_SECRET;
  const secret = "family-route-test-secret-with-at-least-32-characters";
  process.env.JWT_SECRET = secret;
  const userId = "11111111-1111-1111-1111-111111111111";
  let databaseDown = false;
  const prisma = {
    familyMember: {
      findFirst: async () => {
        if (databaseDown) throw Object.assign(new Error("Database unavailable"), { code: "P1001" });
        return { role: "OWNER", family: { id: "22222222-2222-2222-2222-222222222222", name: "Home", members: [] } };
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
    assert.equal((await gatewayPath.json() as { data: { family: { currentUserRole: string } } }).data.family.currentUserRole, "OWNER");
    assert.equal((await fetch(`${base}/api/family/me`, { headers })).status, 200);
    assert.equal((await fetch(`${base}/unknown`)).status, 404);
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
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});
