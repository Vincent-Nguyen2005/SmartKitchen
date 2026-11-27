import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import bcrypt from "bcrypt";
import { PrismaClient, Role } from ".prisma/client-auth";
import { createShippersRouter } from "./shippers.routes";
import { AuthService } from "../services/auth.service";

const KEY = "test-internal-key-with-more-than-32-characters";
const PASSWORD = "Giaohang1"; // test-only value
type UserRow = { id: string; email: string; fullName: string | null; phone: string | null; role: Role; isVerified: boolean; disabledAt: Date | null; passwordHash: string; createdAt: Date };

/** In-memory users + token tables, enough of Prisma for the shipper routes. */
const fakeDb = () => {
  const users: UserRow[] = [];
  const refreshTokens = [{ userId: "", id: "r" }];
  const sessions = [{ userId: "", id: "s" }];
  const pick = (row: UserRow) => ({ id: row.id, email: row.email, fullName: row.fullName, phone: row.phone, disabledAt: row.disabledAt, createdAt: row.createdAt });
  const user = {
    findUnique: async ({ where }: { where: { id?: string; email?: string } }) => users.find((row) => (where.id ? row.id === where.id : row.email === where.email)) ?? null,
    findFirst: async ({ where }: { where: { id: string; role: Role } }) => { const row = users.find((entry) => entry.id === where.id && entry.role === where.role); return row ? pick(row) : null; },
    findMany: async () => users.filter((row) => row.role === Role.SHIPPER).map(pick),
    create: async ({ data }: { data: Omit<UserRow, "id" | "disabledAt" | "createdAt"> }) => {
      const row = { id: `00000000-0000-4000-8000-00000000000${users.length + 1}`, disabledAt: null, createdAt: new Date(), ...data } as UserRow;
      users.push(row);
      return pick(row);
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => { const row = users.find((entry) => entry.id === where.id)!; Object.assign(row, data); return pick(row); },
  };
  const prisma = {
    user,
    refreshToken: { deleteMany: async ({ where }: { where: { userId: string } }) => { const before = refreshTokens.length; refreshTokens.splice(0, refreshTokens.length, ...refreshTokens.filter((row) => row.userId !== where.userId)); return { count: before - refreshTokens.length }; } },
    session: { deleteMany: async ({ where }: { where: { userId: string } }) => { const before = sessions.length; sessions.splice(0, sessions.length, ...sessions.filter((row) => row.userId !== where.userId)); return { count: before - sessions.length }; } },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma),
  };
  return { prisma: prisma as unknown as PrismaClient, users, refreshTokens, sessions };
};

const serve = async (prisma: PrismaClient) => {
  const app = express();
  app.use(express.json());
  app.use("/internal", createShippersRouter(prisma));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const base = `http://127.0.0.1:${address.port}/internal`;
  const call = async (method: string, path: string, body?: unknown, key = KEY) => {
    const response = await fetch(`${base}${path}`, { method, headers: { "x-api-key": key, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const text = await response.text();
    return { status: response.status, text, body: text ? JSON.parse(text) : null };
  };
  return { call, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
};

test("shipper accounts: admin-only (internal key), validated, password hashed and never returned", async () => {
  process.env.INTERNAL_API_KEY = KEY;
  const db = fakeDb();
  const api = await serve(db.prisma);
  try {
    assert.equal((await api.call("GET", "/admin/shippers", undefined, "wrong")).status, 403);
    assert.equal((await api.call("POST", "/admin/shippers", { name: "An", phone: "0901234567", email: "an@example.com", password: PASSWORD }, "wrong")).status, 403);
    assert.equal(db.users.length, 0);

    for (const bad of [{ password: "short" }, { password: "alllowercase1" }, { phone: "12345" }, { email: "not-an-email" }, { name: " " }]) {
      const response = await api.call("POST", "/admin/shippers", { name: "An", phone: "0901234567", email: "an@example.com", password: PASSWORD, ...bad });
      assert.equal(response.status, 400, JSON.stringify(Object.keys(bad)));
    }

    const created = await api.call("POST", "/admin/shippers", { name: "Nguyễn Văn An", phone: "090 123 4567", email: "An@Example.com", password: PASSWORD });
    assert.equal(created.status, 201);
    assert.deepEqual(Object.keys(created.body.shipper).sort(), ["active", "createdAt", "email", "id", "name", "phone"]);
    assert.equal(created.text.includes(PASSWORD), false);
    assert.equal(created.text.toLowerCase().includes("hash"), false);
    const row = db.users[0];
    assert.deepEqual([row.role, row.isVerified, row.email, row.phone], [Role.SHIPPER, true, "an@example.com", "0901234567"]);
    assert.notEqual(row.passwordHash, PASSWORD);
    assert.equal(await bcrypt.compare(PASSWORD, row.passwordHash), true);

    assert.equal((await api.call("POST", "/admin/shippers", { name: "B", phone: "0901234568", email: "an@example.com", password: PASSWORD })).status, 409);

    const list = await api.call("GET", "/admin/shippers");
    assert.equal(list.body.items.length, 1);
    assert.equal(list.text.includes("passwordHash"), false);
  } finally {
    await api.close();
  }
});

test("disable signs the shipper out everywhere; enable and password reset work; status check for shopping-list", async () => {
  process.env.INTERNAL_API_KEY = KEY;
  const db = fakeDb();
  const api = await serve(db.prisma);
  try {
    const { body } = await api.call("POST", "/admin/shippers", { name: "An", phone: "0901234567", email: "an@example.com", password: PASSWORD });
    const id = body.shipper.id as string;
    db.refreshTokens.push({ userId: id, id: "r1" });
    db.sessions.push({ userId: id, id: "s1" });
    assert.deepEqual((await api.call("GET", `/shippers/${id}/status`)).body, { active: true, role: "SHIPPER" });

    const disabled = await api.call("PATCH", `/admin/shippers/${id}/status`, { active: false });
    assert.equal(disabled.body.shipper.active, false);
    assert.equal(db.refreshTokens.some((row) => row.userId === id), false);
    assert.equal(db.sessions.some((row) => row.userId === id), false);
    assert.deepEqual((await api.call("GET", `/shippers/${id}/status`)).body, { active: false, role: "SHIPPER" });

    assert.equal((await api.call("PATCH", `/admin/shippers/${id}/status`, { active: true })).body.shipper.active, true);

    const newPassword = "Matkhau2Moi"; // test-only value
    assert.equal((await api.call("POST", `/admin/shippers/${id}/password`, { password: "weak" })).status, 400);
    const reset = await api.call("POST", `/admin/shippers/${id}/password`, { password: newPassword });
    assert.equal(reset.status, 200);
    assert.equal(reset.text.includes(newPassword), false);
    assert.equal(await bcrypt.compare(newPassword, db.users[0].passwordHash), true);

    // Only SHIPPER accounts are managed here.
    assert.equal((await api.call("PATCH", `/admin/shippers/00000000-0000-4000-8000-000000000099/status`, { active: false })).status, 404);
  } finally {
    await api.close();
  }
});

test("a disabled account cannot sign in (ACCOUNT_DISABLED)", async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const prisma = { user: { findUnique: async () => ({ id: "u1", email: "an@example.com", passwordHash, role: Role.SHIPPER, isVerified: true, disabledAt: new Date() }) } } as unknown as PrismaClient;
  await assert.rejects(new AuthService(prisma, "test-secret").login("an@example.com", PASSWORD), /ACCOUNT_DISABLED/);
});
