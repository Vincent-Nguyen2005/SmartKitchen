import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { AuthController } from "./auth.controller";
import { AuthService, isOwnAvatarUrl } from "../services/auth.service";

const userId = "11111111-1111-4111-8111-111111111111";
const avatar = `/api/inventory/avatars/${userId}/${"a".repeat(32)}.jpg`;

/** In-memory user behind the real AuthService.updateProfile (prisma stubbed). */
const serviceWith = () => {
  const user = { id: userId, email: "member@example.com", fullName: "Lan", avatarUrl: null as string | null, role: "USER", isVerified: true };
  const prisma = {
    user: {
      findUnique: async () => user,
      update: async ({ data }: { data: Partial<typeof user> }) => Object.assign(user, data),
    },
  };
  const service = new AuthService(prisma as never);
  (service as unknown as { verifyAccessToken: () => { sub: string } }).verifyAccessToken = () => ({ sub: userId });
  return { service, user };
};

const withServer = async (service: AuthService, run: (base: string) => Promise<void>) => {
  const app = express();
  app.use(express.json());
  app.patch("/me", new AuthController(service).updateMe);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  try { await run(`http://127.0.0.1:${address.port}`); } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
};
const patch = (base: string, body: unknown, token = "Bearer t") =>
  fetch(`${base}/me`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) }, body: JSON.stringify(body) });

test("PATCH /me saves a trimmed display name of 1-50 characters", async () => {
  const { service, user } = serviceWith();
  await withServer(service, async (base) => {
    const saved = await patch(base, { fullName: "  Nguyễn Văn An  " });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).user.fullName, "Nguyễn Văn An");
    assert.equal(user.fullName, "Nguyễn Văn An");
    assert.equal((await patch(base, { fullName: "   " })).status, 400);
    assert.equal((await patch(base, { fullName: "x".repeat(51) })).status, 400);
    assert.equal((await patch(base, { fullName: "x".repeat(50) })).status, 200);
    assert.equal((await patch(base, {})).status, 400);
    assert.equal((await patch(base, { role: "ADMIN" })).status, 400); // unknown fields are rejected
    assert.equal((await patch(base, { fullName: "An" }, "")).status, 401);
  });
});

test("PATCH /me accepts only the user's own uploaded avatar, and null to remove it", async () => {
  const { service, user } = serviceWith();
  await withServer(service, async (base) => {
    assert.equal((await patch(base, { avatarUrl: avatar })).status, 200);
    assert.equal(user.avatarUrl, avatar);
    const other = `/api/inventory/avatars/22222222-2222-4222-8222-222222222222/${"b".repeat(32)}.jpg`;
    const rejected = await patch(base, { avatarUrl: other });
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).code, "INVALID_AVATAR_URL");
    assert.equal((await patch(base, { avatarUrl: "https://evil.example/a.jpg" })).status, 400);
    assert.equal((await patch(base, { avatarUrl: null })).status, 200);
    assert.equal(user.avatarUrl, null);
  });
  assert.equal(isOwnAvatarUrl(userId, avatar), true);
  assert.equal(isOwnAvatarUrl(userId, `${avatar}?x=1`), false);
});
