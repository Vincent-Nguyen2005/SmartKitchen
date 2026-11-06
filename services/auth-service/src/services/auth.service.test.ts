import assert from "node:assert/strict";
import { test } from "node:test";
import bcrypt from "bcrypt";
import { PrismaClient } from ".prisma/client-auth";
import { AuthService, AuthServiceError } from "./auth.service";
import { MailService, MailServiceError } from "./mail.service";

const makePendingService = async (deliver?: (email: string, code: string) => Promise<void>) => {
  const user = {
    id: "pending-id",
    email: "pending@example.com",
    isVerified: false,
    passwordHash: await bcrypt.hash("OriginalPassword123", 4),
    fullName: "Original Name" as string | null,
    otpCode: null as string | null,
    otpExpiresAt: null as Date | null,
  };
  const sentEmails: string[] = [];
  const prisma = {
    user: {
      findUnique: async () => user,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(user, data);
        return { count: 1 };
      },
    },
  } as unknown as PrismaClient;
  const mailService = {
    sendOtpEmail: async (email: string, code: string) => {
      if (deliver) await deliver(email, code);
      sentEmails.push(email);
    },
  } as MailService;
  return { service: new AuthService(prisma, "test-secret", mailService), user, sentEmails };
};

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

test("register updates a pending account and emails a verification code", async () => {
  const { service, user, sentEmails } = await makePendingService();
  assert.deepEqual(await service.register("PENDING@example.com", "DifferentPassword123", "New Name"),
    { email: user.email });
  assert.equal(await bcrypt.compare("DifferentPassword123", user.passwordHash), true);
  assert.equal(await bcrypt.compare("OriginalPassword123", user.passwordHash), false);
  assert.equal(user.fullName, "New Name");
  assert.match(user.otpCode ?? "", /^\d{6}$/);
  assert.deepEqual(sentEmails, [user.email]);
});

test("register keeps a recent OTP without sending it twice", async () => {
  const { service, user, sentEmails } = await makePendingService();
  await service.register(user.email, "DifferentPassword123");
  const firstCode = user.otpCode;
  await service.register(user.email, "LatestPassword123");
  assert.equal(user.otpCode, firstCode);
  assert.equal(user.fullName, "Original Name");
  assert.equal(await bcrypt.compare("LatestPassword123", user.passwordHash), true);
  assert.deepEqual(sentEmails, [user.email]);
});

test("failed OTP delivery permits immediate registration retry with another password", async () => {
  let attempts = 0;
  const { service, user, sentEmails } = await makePendingService(async () => {
    if (++attempts === 1) throw new MailServiceError("SMTP unavailable", "EMAIL_DELIVERY_FAILED");
  });
  await assert.rejects(service.register(user.email, "DifferentPassword123"),
    (error: unknown) => error instanceof AuthServiceError && error.code === "EMAIL_DELIVERY_FAILED");
  assert.equal(user.otpCode, null);
  assert.equal(user.otpExpiresAt, null);
  await service.register(user.email, "LatestPassword123");
  assert.equal(await bcrypt.compare("LatestPassword123", user.passwordHash), true);
  assert.match(user.otpCode ?? "", /^\d{6}$/);
  assert.deepEqual(sentEmails, [user.email]);
});
