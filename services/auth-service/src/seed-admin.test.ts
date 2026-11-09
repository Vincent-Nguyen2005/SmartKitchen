import assert from "node:assert/strict";
import { test } from "node:test";
import bcrypt from "bcrypt";
import { PrismaClient, Role } from ".prisma/client-auth";
import { seedAdmin } from "./seed-admin";

const env = { ADMIN_EMAIL: "  ADMIN@SmartKitchen.Local ", ADMIN_PASSWORD: "ExamplePassword123" };

test("seed creates one verified admin using the registration password hash", async () => {
  let stored: Record<string, unknown> | undefined;
  const prisma = { user: {
    findUnique: async () => null,
    createMany: async ({ data, skipDuplicates }: { data: Record<string, unknown>[]; skipDuplicates: boolean }) => {
      assert.equal(skipDuplicates, true);
      stored = data[0];
      return { count: 1 };
    },
  } } as unknown as PrismaClient;

  assert.equal(await seedAdmin(prisma, env), "created");
  assert.equal(stored?.email, "admin@smartkitchen.local");
  assert.equal(stored?.role, Role.ADMIN);
  assert.equal(stored?.isVerified, true);
  assert.equal(await bcrypt.compare(env.ADMIN_PASSWORD, stored?.passwordHash as string), true);
  assert.equal((stored?.passwordHash as string).startsWith("$2"), true);
});

test("seed never changes a pre-existing account", async () => {
  let writes = 0;
  const prisma = { user: {
    findUnique: async () => ({ id: "existing-id", role: Role.USER, passwordHash: "old-hash" }),
    createMany: async () => { writes++; return { count: 1 }; },
  } } as unknown as PrismaClient;

  assert.equal(await seedAdmin(prisma, env), "already-exists");
  assert.equal(writes, 0);
});

test("seed skips when either variable is missing", async () => {
  let queries = 0;
  const prisma = { user: { findUnique: async () => { queries++; return null; } } } as unknown as PrismaClient;
  assert.equal(await seedAdmin(prisma, {}), "skipped");
  assert.equal(await seedAdmin(prisma, { ADMIN_EMAIL: env.ADMIN_EMAIL }), "skipped");
  assert.equal(await seedAdmin(prisma, { ADMIN_PASSWORD: env.ADMIN_PASSWORD }), "skipped");
  assert.equal(queries, 0);
});

test("seed handles a concurrent insert without overwriting it", async () => {
  const prisma = { user: {
    findUnique: async () => null,
    createMany: async () => ({ count: 0 }),
  } } as unknown as PrismaClient;
  assert.equal(await seedAdmin(prisma, env), "already-exists");
});
