import assert from "node:assert/strict";
import { test } from "node:test";
import bcrypt from "bcrypt";
import { PrismaClient } from ".prisma/client-auth";
import { AuthService, AuthServiceError } from "./auth.service";

test("register rejects an existing verified email without changing its password", async () => {
  const passwordHash = await bcrypt.hash("OriginalPassword123", 4);
  let writes = 0;
  const prisma = {
    user: {
      findUnique: async () => ({ email: "old@example.com", isVerified: true, passwordHash }),
      create: async () => { writes++; },
      update: async () => { writes++; },
    },
  } as unknown as PrismaClient;
  const service = new AuthService(prisma);
  await assert.rejects(service.register("OLD@example.com", "DifferentPassword123"),
    (error: unknown) => error instanceof AuthServiceError && error.code === "EMAIL_ALREADY_REGISTERED");
  assert.equal(writes, 0);
  assert.equal(await bcrypt.compare("OriginalPassword123", passwordHash), true);
  assert.equal(await bcrypt.compare("DifferentPassword123", passwordHash), false);
});

test("register rejects a different password for a pending email", async () => {
  const passwordHash = await bcrypt.hash("OriginalPassword123", 4);
  let writes = 0;
  const prisma = {
    user: {
      findUnique: async () => ({ email: "pending@example.com", isVerified: false, passwordHash }),
      create: async () => { writes++; },
      update: async () => { writes++; },
    },
  } as unknown as PrismaClient;
  const service = new AuthService(prisma);
  await assert.rejects(service.register("pending@example.com", "DifferentPassword123"),
    (error: unknown) => error instanceof AuthServiceError && error.code === "EMAIL_ALREADY_REGISTERED");
  assert.equal(writes, 0);
});
