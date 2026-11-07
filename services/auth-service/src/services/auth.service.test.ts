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
    { email: user.email, otpSent: true, retryAfterSeconds: 60 });
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
  const retry = await service.register(user.email, "LatestPassword123");
  assert.equal(retry.otpSent, false);
  assert.ok(retry.retryAfterSeconds > 0 && retry.retryAfterSeconds <= 60);
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

test("a newly created account with failed email delivery can register again", async () => {
  const state = { stored: null as {
    id: string; email: string; isVerified: boolean; passwordHash: string;
    otpCode: string | null; otpExpiresAt: Date | null;
  } | null };
  let attempts = 0;
  const sentTo: string[] = [];
  const prisma = {
    user: {
      findUnique: async () => state.stored,
      create: async ({ data }: { data: Record<string, any> }) => {
        state.stored = { id: "new-id", email: data.email, isVerified: false, passwordHash: data.passwordHash,
          otpCode: data.otpCode, otpExpiresAt: data.otpExpiresAt };
        return state.stored;
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        if (!state.stored) return { count: 0 };
        Object.assign(state.stored, data);
        return { count: 1 };
      },
    },
  } as unknown as PrismaClient;
  const mail = { sendOtpEmail: async (email: string) => {
    if (++attempts === 1) throw new MailServiceError("SMTP unavailable", "EMAIL_DELIVERY_FAILED");
    sentTo.push(email);
  } } as unknown as MailService;
  const service = new AuthService(prisma, "test-secret", mail);
  await assert.rejects(service.register("NEW@example.com", "FirstPassword123"),
    (error: unknown) => error instanceof AuthServiceError && error.code === "EMAIL_DELIVERY_FAILED");
  assert.equal(state.stored?.otpCode, null);
  await service.register("NEW@example.com", "SecondPassword123");
  assert.deepEqual(sentTo, ["new@example.com"]);
  assert.ok(state.stored);
  assert.equal(await bcrypt.compare("SecondPassword123", state.stored.passwordHash), true);
});

const makeService = (deliver?: (email: string, code: string) => Promise<void>) => {
  const user = {
    id: "user-1", email: "member@example.com", isVerified: true,
    passwordHash: "old-hash", resetCodeHash: null as string | null,
    resetExpiresAt: null as Date | null, resetRequestedAt: null as Date | null,
    resetAttempts: 0,
  };
  const emails: { to: string; code: string }[] = [];
  let revokedTokens = 0;
  let revokedSessions = 0;
  const db = {
    user: {
      findUnique: async ({ where }: { where: { email: string } }) => where.email === user.email ? { ...user } : null,
      update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(user, data); return { ...user }; },
      updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
        if (where.id !== user.id || (where.resetCodeHash && where.resetCodeHash !== user.resetCodeHash)
          || (where.resetAttempts?.lt !== undefined && user.resetAttempts >= where.resetAttempts.lt)
          || (where.resetExpiresAt?.gt && (!user.resetExpiresAt || user.resetExpiresAt <= where.resetExpiresAt.gt))) return { count: 0 };
        for (const [key, value] of Object.entries(data)) {
          if (key === "resetAttempts" && typeof value === "object" && value?.increment) user.resetAttempts += value.increment;
          else Object.assign(user, { [key]: value });
        }
        return { count: 1 };
      },
    },
    refreshToken: { deleteMany: async () => { revokedTokens++; return { count: 1 }; } },
    session: { deleteMany: async () => { revokedSessions++; return { count: 1 }; } },
    $transaction: async (operation: (transaction: unknown) => Promise<unknown>) => operation(db),
  } as unknown as PrismaClient;
  const mail = { sendPasswordResetEmail: async (to: string, code: string) => {
    if (deliver) await deliver(to, code);
    emails.push({ to, code });
  } } as MailService;
  return { service: new AuthService(db, "test-secret", mail), user, emails,
    revoked: () => ({ tokens: revokedTokens, sessions: revokedSessions }) };
};

test("password reset uses the registered email, stores only a hash, and revokes sessions", async () => {
  const { service, user, emails, revoked } = makeService();
  await service.requestPasswordReset("MEMBER@example.com");
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, user.email);
  assert.match(emails[0].code, /^\d{8}$/);
  assert.notEqual(user.resetCodeHash, emails[0].code);
  assert.ok(user.resetExpiresAt && user.resetExpiresAt > new Date());
  await service.confirmPasswordReset(user.email, emails[0].code, "NewPassword123");
  assert.equal(await bcrypt.compare("NewPassword123", user.passwordHash), true);
  assert.equal(user.resetCodeHash, null);
  assert.deepEqual(revoked(), { tokens: 1, sessions: 1 });
  await assert.rejects(service.confirmPasswordReset(user.email, emails[0].code, "AnotherPassword123"),
    (error: unknown) => error instanceof AuthServiceError && error.code === "INVALID_RESET_CODE");
});

test("password reset request does not reveal missing accounts and enforces cooldown", async () => {
  const { service, emails } = makeService();
  await service.requestPasswordReset("missing@example.com");
  assert.equal(emails.length, 0);
  await service.requestPasswordReset("member@example.com");
  await service.requestPasswordReset("member@example.com");
  assert.equal(emails.length, 1);
});

test("invalid reset codes are limited to five attempts", async () => {
  const { service, user, emails } = makeService();
  await service.requestPasswordReset(user.email);
  for (let attempt = 0; attempt < 5; attempt++) {
    await assert.rejects(service.confirmPasswordReset(user.email, "00000000", "NewPassword123"),
      (error: unknown) => error instanceof AuthServiceError && error.code === "INVALID_RESET_CODE");
  }
  assert.equal(user.resetAttempts, 5);
  await assert.rejects(service.confirmPasswordReset(user.email, emails[0].code, "NewPassword123"),
    (error: unknown) => error instanceof AuthServiceError && error.code === "INVALID_RESET_CODE");
  assert.equal(user.passwordHash, "old-hash");
});

test("expired password reset codes cannot change the password", async () => {
  const { service, user, emails, revoked } = makeService();
  await service.requestPasswordReset(user.email);
  user.resetExpiresAt = new Date(Date.now() - 1);
  await assert.rejects(service.confirmPasswordReset(user.email, emails[0].code, "NewPassword123"),
    (error: unknown) => error instanceof AuthServiceError && error.code === "INVALID_RESET_CODE");
  assert.equal(user.passwordHash, "old-hash");
  assert.deepEqual(revoked(), { tokens: 0, sessions: 0 });
});

test("failed reset email permits an immediate retry", async () => {
  let attempts = 0;
  const { service, user, emails } = makeService(async () => {
    if (++attempts === 1) throw new MailServiceError("SMTP unavailable", "EMAIL_DELIVERY_FAILED");
  });
  await assert.rejects(service.requestPasswordReset(user.email),
    (error: unknown) => error instanceof AuthServiceError && error.code === "EMAIL_DELIVERY_FAILED");
  assert.equal(user.resetCodeHash, null);
  assert.equal(user.resetRequestedAt, null);
  await service.requestPasswordReset(user.email);
  assert.equal(emails.length, 1);
});
