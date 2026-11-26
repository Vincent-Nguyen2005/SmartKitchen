import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import { PrismaClient } from ".prisma/client-auth";
import { AuthService, accessTokenTtl, refreshTokenTtlMs } from "./auth.service";

const DAY_MS = 24 * 60 * 60 * 1000;

test("access token lifetime: 15 minutes by default; ACCESS_TOKEN_TTL accepts 1 minute .. 24 hours", () => {
  assert.equal(accessTokenTtl(undefined), "15m");
  assert.equal(accessTokenTtl("30m"), "30m");
  assert.equal(accessTokenTtl("900s"), "900s");
  assert.equal(accessTokenTtl("1h"), "1h");
  for (const invalid of ["", "abc", "10", "30s", "25h", "-5m", "1d"]) assert.equal(accessTokenTtl(invalid), "15m", invalid);
});

test("refresh token lifetime: 30 days by default; REFRESH_TOKEN_TTL_DAYS accepts 1 .. 365 whole days", () => {
  assert.equal(refreshTokenTtlMs(undefined), 30 * DAY_MS);
  assert.equal(refreshTokenTtlMs("60"), 60 * DAY_MS);
  for (const invalid of ["", "0", "366", "1.5", "abc", "-3"]) assert.equal(refreshTokenTtlMs(invalid), 30 * DAY_MS, invalid);
});

test("refresh rotates the token (old one revoked, reuse rejected) and the new one gets the full lifetime again", async () => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "member@example.com", role: "USER", isVerified: true, fullName: null, avatarUrl: null };
  const tokens: Array<{ id: string; token: string; userId: string; expiresAt: Date }> = [];
  let nextId = 1;
  const db = {
    refreshToken: {
      findUnique: async ({ where }: { where: { token: string } }) => {
        const row = tokens.find((entry) => entry.token === where.token);
        return row ? { ...row, user } : null;
      },
      deleteMany: async ({ where }: { where: { id?: string; expiresAt?: { gt: Date } } }) => {
        const index = tokens.findIndex((entry) => entry.id === where.id && (!where.expiresAt || entry.expiresAt > where.expiresAt.gt));
        if (index < 0) return { count: 0 };
        tokens.splice(index, 1);
        return { count: 1 };
      },
      create: async ({ data }: { data: { token: string; userId: string; expiresAt: Date } }) => {
        const row = { id: String(nextId++), ...data };
        tokens.push(row);
        return row;
      },
    },
    session: { create: async () => ({}) },
    $transaction: async (operation: unknown) => (typeof operation === "function" ? operation(db) : Promise.all(operation as Promise<unknown>[])),
  } as unknown as PrismaClient;
  const service = new AuthService(db, "test-secret");
  // An existing session whose refresh token was issued 20 days ago (10 days left).
  const initial = await (service as unknown as { issueTokens: (u: typeof user) => Promise<{ refreshToken: string }> }).issueTokens(user);
  tokens[0].expiresAt = new Date(Date.now() + 10 * DAY_MS);

  const before = Date.now();
  const refreshed = await service.refresh(initial.refreshToken);
  assert.notEqual(refreshed.refreshToken, initial.refreshToken);
  assert.equal(tokens.length, 1, "the old refresh token is deleted");
  const lifetime = tokens[0].expiresAt.getTime() - before;
  assert.ok(lifetime >= 30 * DAY_MS - 5_000 && lifetime <= 30 * DAY_MS + 5_000, "sliding: 30 days from this refresh");
  const payload = jwt.verify(refreshed.accessToken, "test-secret") as { exp: number; iat: number };
  assert.equal(payload.exp - payload.iat, 15 * 60, "the access token stays short-lived");

  await assert.rejects(service.refresh(initial.refreshToken), /INVALID_REFRESH_TOKEN/);
});
