import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import express from "express";
import { PrismaClient } from ".prisma/client-family";
import { createFamilyRouter } from "./family.routes";
import { QR_PREFIX, tokenFromScan } from "../services/family-qr.service";

const secret = "family-qr-test-secret-with-at-least-32-characters";
const familyId = "22222222-2222-4222-8222-222222222222";
const otherFamilyId = "44444444-4444-4444-8444-444444444444";
const owner = "11111111-1111-4111-8111-111111111111";
const member = "33333333-3333-4333-8333-333333333333";
const newcomer = "55555555-5555-4555-8555-555555555555";
const stranger = "66666666-6666-4666-8666-666666666666"; // belongs to another family

/** In-memory family-service database for the QR flow. */
const fakeDatabase = () => {
  const families = new Map([[familyId, { id: familyId, name: "Nhà Lan", ownerId: owner }], [otherFamilyId, { id: otherFamilyId, name: "Nhà khác", ownerId: stranger }]]);
  const members = [
    { id: "m1", familyId, userId: owner, role: "OWNER" },
    { id: "m2", familyId, userId: member, role: "MEMBER" },
    { id: "m3", familyId: otherFamilyId, userId: stranger, role: "OWNER" },
  ];
  const tokens = new Map<string, { familyId: string; tokenHash: string; createdAt: Date; expiresAt: Date }>();
  const prisma = {
    familyMember: {
      findFirst: async ({ where }: { where: { userId: string } }) => {
        const row = members.find((entry) => entry.userId === where.userId);
        return row ? { ...row, family: families.get(row.familyId) } : null;
      },
      create: async ({ data }: { data: { familyId: string; userId: string; role: string } }) => {
        const row = { id: `m${members.length + 1}`, ...data };
        members.push(row);
        return row;
      },
    },
    familyQrToken: {
      upsert: async ({ where, create, update }: { where: { familyId: string }; create: { familyId: string; tokenHash: string; createdAt: Date; expiresAt: Date }; update: object }) => {
        const existing = tokens.get(where.familyId);
        tokens.set(where.familyId, existing ? { ...existing, ...update } : create);
      },
      deleteMany: async ({ where }: { where: { familyId: string; tokenHash?: string } }) => {
        const row = tokens.get(where.familyId);
        if (!row || (where.tokenHash && row.tokenHash !== where.tokenHash)) return { count: 0 };
        tokens.delete(where.familyId);
        return { count: 1 };
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const row = [...tokens.values()].find((entry) => entry.tokenHash === where.tokenHash);
        return row ? { ...row, family: { id: row.familyId, name: families.get(row.familyId)!.name } } : null;
      },
    },
  } as unknown as PrismaClient;
  return { prisma, members, tokens };
};

const bearer = (sub: string) => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const signed = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `Bearer ${signed}.${createHmac("sha256", secret).update(signed).digest("base64url")}`;
};

const withApp = async (run: (call: (user: string, path: string, body?: object) => Promise<{ status: number; body: any }>, state: ReturnType<typeof fakeDatabase>, clock: { now: number }) => Promise<void>) => {
  process.env.JWT_SECRET = secret;
  const state = fakeDatabase();
  const clock = { now: Date.parse("2026-12-01T03:00:00Z") };
  const app = express();
  app.use(express.json());
  app.use("/", createFamilyRouter(state.prisma, () => new Date(clock.now)));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const call = async (user: string, path: string, body: object = {}) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: "POST", headers: { Authorization: bearer(user), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  try { await run(call, state, clock); } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
};

test("only the owner creates or revokes the family QR; the QR holds an opaque token and only its hash is stored", async () => {
  await withApp(async (call, state) => {
    const created = await call(owner, "/qr");
    assert.equal(created.status, 201);
    const { token, payload, family } = created.body.data;
    assert.equal(payload, `${QR_PREFIX}${token}`);
    assert.match(token, /^[A-Za-z0-9_-]{32}$/);
    assert.deepEqual(family, { id: familyId, name: "Nhà Lan" });
    assert.ok(!payload.includes(familyId));
    const stored = state.tokens.get(familyId)!;
    assert.notEqual(stored.tokenHash, token);
    assert.equal(stored.tokenHash.length, 64);
    for (const user of [member, newcomer]) {
      const refused = await call(user, "/qr");
      assert.equal(refused.status, user === member ? 403 : 404);
      assert.equal((await call(user, "/qr/revoke")).status, user === member ? 403 : 404);
    }
  });
});

test("a new QR revokes the previous one; closing the sheet (revoke) makes joining fail", async () => {
  await withApp(async (call) => {
    const first = (await call(owner, "/qr")).body.data.token;
    const second = (await call(owner, "/qr")).body.data.token;
    const old = await call(newcomer, "/qr/join", { token: `${QR_PREFIX}${first}` });
    assert.equal(old.status, 410);
    assert.equal(old.body.code, "QR_EXPIRED");
    // Revoking an older token never touches the current one; revoking the current one ends it.
    assert.deepEqual((await call(owner, "/qr/revoke", { token: first })).body.data, { revoked: false });
    assert.deepEqual((await call(owner, "/qr/revoke", { token: second })).body.data, { revoked: true });
    assert.equal((await call(newcomer, "/qr/verify", { token: second })).status, 410);
    assert.equal((await call(newcomer, "/qr/join", { token: second })).status, 410);
  });
});

test("a token expires 10 minutes after creation even if it is never revoked", async () => {
  await withApp(async (call, _state, clock) => {
    const token = (await call(owner, "/qr")).body.data.token;
    clock.now += 9 * 60 * 1000;
    assert.equal((await call(newcomer, "/qr/verify", { token })).status, 200);
    clock.now += 61 * 1000;
    const late = await call(newcomer, "/qr/join", { token });
    assert.equal(late.status, 410);
    assert.equal(late.body.error, "Mã QR đã hết hạn, nhờ chủ nhà mở lại mã");
  });
});

test("joining with a valid token; several people may join while it is shown; already-member and other-family cases", async () => {
  await withApp(async (call, state) => {
    const token = (await call(owner, "/qr")).body.data.payload;
    assert.deepEqual((await call(newcomer, "/qr/verify", { token })).body.data, { family: { id: familyId, name: "Nhà Lan" }, membership: "none" });
    const joined = await call(newcomer, "/qr/join", { token });
    assert.equal(joined.status, 201);
    assert.equal(joined.body.data.membership.role, "MEMBER");
    assert.ok(state.members.some((entry) => entry.userId === newcomer && entry.familyId === familyId));
    const second = "77777777-7777-4777-8777-777777777777";
    assert.equal((await call(second, "/qr/join", { token })).status, 201);

    assert.equal((await call(member, "/qr/verify", { token })).body.data.membership, "this");
    const again = await call(member, "/qr/join", { token });
    assert.deepEqual([again.status, again.body.code, again.body.error], [409, "ALREADY_MEMBER", "Bạn đã ở trong gia đình này"]);
    assert.equal((await call(stranger, "/qr/verify", { token })).body.data.membership, "other");
    const other = await call(stranger, "/qr/join", { token });
    assert.deepEqual([other.status, other.body.code], [409, "OTHER_FAMILY"]);
    assert.ok(!state.members.some((entry) => entry.userId === stranger && entry.familyId === familyId));
  });
});

test("verify / join are rate limited per user against guessing", async () => {
  await withApp(async (call) => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) statuses.push((await call(newcomer, "/qr/verify", { token: "A".repeat(32) })).status);
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(410));
    assert.equal(statuses[10], 429);
    // Another user is not affected.
    assert.equal((await call(member, "/qr/verify", { token: "A".repeat(32) })).status, 410);
  });
});

test("scanned text: the full QR value or the bare token; anything else is invalid", () => {
  const token = "abcdefghijklmnopqrstuvwxyz012345";
  assert.equal(tokenFromScan(`${QR_PREFIX}${token}`), token);
  assert.equal(tokenFromScan(` ${token} `), token);
  assert.equal(tokenFromScan("https://evil.example/join?t=x"), null);
  assert.equal(tokenFromScan(`${QR_PREFIX}short`), null);
});
