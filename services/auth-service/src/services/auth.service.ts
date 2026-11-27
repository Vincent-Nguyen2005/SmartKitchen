import argon2 from "argon2";
import bcrypt from "bcrypt";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import jwt from "jsonwebtoken";
import { Prisma, PrismaClient, Role, User } from ".prisma/client-auth";
import { MailService, MailServiceError } from "./mail.service";
import { hashPassword } from "./password";

/**
 * Token lifetimes. The access token stays short-lived; the refresh token is long-lived and sliding: every refresh
 * rotates it (the old one is deleted) and the new one gets the full lifetime again. Both can be set by env.
 */
const DEFAULT_ACCESS_TOKEN_TTL = "15m";
const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 30;
/** ACCESS_TOKEN_TTL: a jsonwebtoken duration such as "15m", "900s" or "1h" (1 minute .. 24 hours); else 15m. */
export const accessTokenTtl = (value = process.env.ACCESS_TOKEN_TTL): string => {
  const match = /^(\d+)\s*(s|m|h)$/.exec(value?.trim() ?? "");
  if (!match) return DEFAULT_ACCESS_TOKEN_TTL;
  const seconds = Number(match[1]) * ({ s: 1, m: 60, h: 3600 } as const)[match[2] as "s" | "m" | "h"];
  return seconds >= 60 && seconds <= 24 * 3600 ? `${match[1]}${match[2]}` : DEFAULT_ACCESS_TOKEN_TTL;
};
/** REFRESH_TOKEN_TTL_DAYS: whole days, 1 .. 365; else 30. */
export const refreshTokenTtlMs = (value = process.env.REFRESH_TOKEN_TTL_DAYS): number => {
  const days = Number(value);
  const valid = Number.isInteger(days) && days >= 1 && days <= 365;
  return (valid ? days : DEFAULT_REFRESH_TOKEN_TTL_DAYS) * 24 * 60 * 60 * 1000;
};
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;

export class AuthServiceError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "AuthServiceError";
  }
}

/** Avatar photo path written by inventory-service (POST /api/inventory/avatars) for this user. */
export const isOwnAvatarUrl = (userId: string, url: string): boolean =>
  /^\/api\/inventory\/avatars\/([0-9a-f-]{36})\/[a-f0-9]{32}\.jpg$/.exec(url)?.[1] === userId.toLowerCase();

export type PublicUser = Pick<User, "id" | "email" | "fullName" | "avatarUrl" | "role" | "isVerified">;

export type AuthResult = {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
};
export type RegistrationResult = { email: string; otpSent: boolean; retryAfterSeconds: number };

export type AccessTokenPayload = jwt.JwtPayload & { sub: string; email: string; role: Role };

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtSecret = process.env.JWT_SECRET || "development-only-secret",
    private readonly mailService = new MailService(),
  ) {}

  async register(email: string, password: string, fullName?: string): Promise<RegistrationResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, isVerified: true, otpCode: true, otpExpiresAt: true },
    });
    if (existingUser && !existingUser.isVerified) {
      const now = Date.now();
      const hasRecentOtp = Boolean(existingUser.otpCode && existingUser.otpExpiresAt
        && now < existingUser.otpExpiresAt.getTime() - OTP_TTL_MS + OTP_RESEND_COOLDOWN_MS);
      const otpCode = hasRecentOtp ? existingUser.otpCode : this.generateOtp();
      const updated = await this.prisma.user.updateMany({
        where: { id: existingUser.id, isVerified: false },
        data: {
          passwordHash: await hashPassword(password),
          ...(fullName !== undefined ? { fullName: fullName || null } : {}),
          ...(!hasRecentOtp ? { otpCode, otpExpiresAt: new Date(now + OTP_TTL_MS) } : {}),
        },
      });
      if (updated.count !== 1) throw new AuthServiceError("Email is already registered", "EMAIL_ALREADY_REGISTERED");
      // Keep the recently emailed code valid instead of sending another message during cooldown.
      if (!hasRecentOtp && otpCode) await this.sendOtpEmail(existingUser.id, existingUser.email, otpCode);
      const retryAfterSeconds = hasRecentOtp && existingUser.otpExpiresAt
        ? Math.max(1, Math.ceil((existingUser.otpExpiresAt.getTime() - OTP_TTL_MS + OTP_RESEND_COOLDOWN_MS - now) / 1000))
        : 60;
      return { email: existingUser.email, otpSent: !hasRecentOtp, retryAfterSeconds };
    }
    if (existingUser) throw new AuthServiceError("Email is already registered", "EMAIL_ALREADY_REGISTERED");

    const passwordHash = await hashPassword(password);
    const otpCode = this.generateOtp();
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        fullName: fullName || null,
        isVerified: false,
        otpCode,
        otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    await this.sendOtpEmail(user.id, user.email, otpCode);
    return { email: user.email, otpSent: true, retryAfterSeconds: 60 };
  }

  async verifyOtp(
    email: string,
    otpCode: string,
    requestContext?: { ipAddress?: string; userAgent?: string },
  ): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || user.isVerified || !user.otpCode || !this.otpMatches(user.otpCode, otpCode)) {
      throw new AuthServiceError("The verification code is invalid", "INVALID_OTP");
    }
    if (!user.otpExpiresAt || user.otpExpiresAt <= new Date()) {
      throw new AuthServiceError("The verification code has expired. Request a new code.", "OTP_EXPIRED");
    }

    return this.prisma.$transaction(async (transaction) => {
      const verified = await transaction.user.updateMany({
        where: { id: user.id, isVerified: false, otpCode, otpExpiresAt: { gt: new Date() } },
        data: { isVerified: true, otpCode: null, otpExpiresAt: null },
      });
      if (verified.count !== 1) {
        throw new AuthServiceError("The verification code is invalid or expired", "INVALID_OTP");
      }
      const verifiedUser = await transaction.user.findUniqueOrThrow({ where: { id: user.id } });
      return this.issueTokens(verifiedUser, requestContext, transaction);
    });
  }

  async resendOtp(email: string): Promise<{ email: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) throw new AuthServiceError("No account was found for this email", "ACCOUNT_NOT_FOUND");
    if (user.isVerified) throw new AuthServiceError("This account is already verified", "ACCOUNT_ALREADY_VERIFIED");

    const now = Date.now();
    if (user.otpExpiresAt) {
      const nextAllowedAt = user.otpExpiresAt.getTime() - OTP_TTL_MS + OTP_RESEND_COOLDOWN_MS;
      if (now < nextAllowedAt) {
        const seconds = Math.ceil((nextAllowedAt - now) / 1000);
        throw new AuthServiceError(`Please wait ${seconds} seconds before requesting another code`, "OTP_RESEND_COOLDOWN");
      }
    }
    const otpCode = this.generateOtp();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { otpCode, otpExpiresAt: new Date(now + OTP_TTL_MS) },
    });
    await this.sendOtpEmail(user.id, user.email, otpCode);
    return { email: user.email };
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    // Do not reveal whether an address has a verified account.
    if (!user?.isVerified) return;
    const now = Date.now();
    if (user.resetRequestedAt && now - user.resetRequestedAt.getTime() < PASSWORD_RESET_COOLDOWN_MS) return;
    const code = randomInt(10_000_000, 100_000_000).toString();
    const codeHash = this.hashResetCode(user.id, code);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetCodeHash: codeHash,
        resetExpiresAt: new Date(now + PASSWORD_RESET_TTL_MS),
        resetRequestedAt: new Date(now),
        resetAttempts: 0,
      },
    });
    try {
      await this.mailService.sendPasswordResetEmail(user.email, code);
    } catch (error) {
      await this.prisma.user.updateMany({
        where: { id: user.id, resetCodeHash: codeHash },
        data: { resetCodeHash: null, resetExpiresAt: null, resetRequestedAt: null },
      }).catch((cleanupError) => console.error("[auth-service] failed to clear undelivered password reset", cleanupError));
      if (error instanceof MailServiceError) throw new AuthServiceError(error.message, error.code);
      throw error;
    }
  }

  async verifyPasswordResetCode(email: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user?.isVerified || !user.resetCodeHash || !user.resetExpiresAt
      || user.resetExpiresAt <= new Date() || user.resetAttempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
      throw new AuthServiceError("Invalid or expired password reset code", "INVALID_RESET_CODE");
    }
    const candidate = this.hashResetCode(user.id, code);
    if (!timingSafeEqual(Buffer.from(user.resetCodeHash, "hex"), Buffer.from(candidate, "hex"))) {
      await this.prisma.user.updateMany({
        where: { id: user.id, resetCodeHash: user.resetCodeHash, resetAttempts: { lt: PASSWORD_RESET_MAX_ATTEMPTS } },
        data: { resetAttempts: { increment: 1 } },
      });
      throw new AuthServiceError("Invalid or expired password reset code", "INVALID_RESET_CODE");
    }
  }

  async confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
    await this.verifyPasswordResetCode(email, code);
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) throw new AuthServiceError("Invalid or expired password reset code", "INVALID_RESET_CODE");
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.user.updateMany({
        where: { id: user.id, resetCodeHash: user.resetCodeHash, resetExpiresAt: { gt: new Date() }, resetAttempts: { lt: PASSWORD_RESET_MAX_ATTEMPTS } },
        data: { passwordHash, resetCodeHash: null, resetExpiresAt: null, resetRequestedAt: null, resetAttempts: 0 },
      });
      if (changed.count !== 1) throw new AuthServiceError("Invalid or expired password reset code", "INVALID_RESET_CODE");
      await transaction.refreshToken.deleteMany({ where: { userId: user.id } });
      await transaction.session.deleteMany({ where: { userId: user.id } });
    });
  }

  async login(email: string, password: string, requestContext?: { ipAddress?: string; userAgent?: string }): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordMatches = user && (user.passwordHash.startsWith("$argon2")
      ? await argon2.verify(user.passwordHash, password)
      : await bcrypt.compare(password, user.passwordHash));
    if (!user || !passwordMatches) {
      throw new Error("INVALID_CREDENTIALS");
    }
    if (!user.isVerified) throw new Error("EMAIL_NOT_VERIFIED");
    if (user.disabledAt) throw new Error("ACCOUNT_DISABLED");

    return this.issueTokens(user, requestContext);
  }

  async loginWithGoogle(profile: { email: string; fullName?: string; avatarUrl?: string }): Promise<AuthResult> {
    const email = profile.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(randomBytes(48).toString("base64url"));
    const user = await this.prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        fullName: profile.fullName ?? null,
        avatarUrl: profile.avatarUrl ?? null,
        isVerified: true,
      },
      update: {
        isVerified: true,
        ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
      },
    });
    if (user.disabledAt) throw new Error("ACCOUNT_DISABLED");
    return this.issueTokens(user);
  }

  async logout(refreshToken?: string, accessToken?: string): Promise<void> {
    await Promise.all([
      ...(refreshToken ? [this.prisma.refreshToken.deleteMany({ where: { token: { in: [this.hashRefreshToken(refreshToken), refreshToken] } } })] : []),
      ...(accessToken ? [this.prisma.session.deleteMany({ where: { token: accessToken } })] : []),
    ]);
  }

  async refresh(refreshToken: string, requestContext?: { ipAddress?: string; userAgent?: string }): Promise<AuthResult> {
    const storedToken = await this.prisma.refreshToken.findUnique({ where: { token: this.hashRefreshToken(refreshToken) }, include: { user: true } })
      ?? await this.prisma.refreshToken.findUnique({ where: { token: refreshToken }, include: { user: true } });
    if (!storedToken || storedToken.expiresAt <= new Date()) {
      if (storedToken) await this.prisma.refreshToken.deleteMany({ where: { id: storedToken.id } });
      throw new Error("INVALID_REFRESH_TOKEN");
    }
    if (!storedToken.user.isVerified) {
      await this.prisma.refreshToken.deleteMany({ where: { id: storedToken.id } });
      throw new Error("EMAIL_NOT_VERIFIED");
    }
    if (storedToken.user.disabledAt) {
      await this.prisma.refreshToken.deleteMany({ where: { userId: storedToken.user.id } });
      throw new Error("ACCOUNT_DISABLED");
    }

    return this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.refreshToken.deleteMany({ where: { id: storedToken.id, expiresAt: { gt: new Date() } } });
      if (revoked.count !== 1) throw new Error("INVALID_REFRESH_TOKEN");
      return this.issueTokens(storedToken.user, requestContext, transaction);
    });
  }

  /**
   * Hồ sơ: display name and avatar of the signed-in user. The avatar is a photo stored by inventory-service (same
   * storage as Kho photos) under this user's own path; null removes it. Returns null when the user does not exist.
   */
  async updateProfile(userId: string, changes: { fullName?: string; avatarUrl?: string | null }): Promise<PublicUser | null> {
    const data: { fullName?: string; avatarUrl?: string | null } = {};
    if (changes.fullName !== undefined) data.fullName = changes.fullName;
    if (changes.avatarUrl !== undefined) {
      if (changes.avatarUrl !== null && !isOwnAvatarUrl(userId, changes.avatarUrl)) throw new AuthServiceError("Avatar must be a photo uploaded by this user", "INVALID_AVATAR_URL");
      data.avatarUrl = changes.avatarUrl;
    }
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) return null;
    if (Object.keys(data).length === 0) return this.toPublicUser(existing);
    return this.toPublicUser(await this.prisma.user.update({ where: { id: userId }, data }));
  }

  async getUser(userId: string): Promise<PublicUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user ? this.toPublicUser(user) : null;
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return jwt.verify(token, this.jwtSecret) as AccessTokenPayload;
  }

  private async issueTokens(
    user: User,
    requestContext?: { ipAddress?: string; userAgent?: string },
    transaction: PrismaClient | Prisma.TransactionClient = this.prisma,
  ): Promise<AuthResult> {
    const accessToken = jwt.sign({ email: user.email, role: user.role }, this.jwtSecret, {
      subject: user.id,
      expiresIn: accessTokenTtl() as jwt.SignOptions["expiresIn"],
    });
    const refreshToken = randomBytes(48).toString("hex");

    const tokenWrite = transaction.refreshToken.create({
        data: { token: this.hashRefreshToken(refreshToken), userId: user.id, expiresAt: new Date(Date.now() + refreshTokenTtlMs()) },
      });
    const sessionWrite = transaction.session.create({
        data: { token: accessToken, userId: user.id, ipAddress: requestContext?.ipAddress, userAgent: requestContext?.userAgent },
      });
    if (transaction === this.prisma) await this.prisma.$transaction([tokenWrite, sessionWrite]);
    else await Promise.all([tokenWrite, sessionWrite]);

    return { accessToken, refreshToken, user: this.toPublicUser(user) };
  }

  private toPublicUser(user: User): PublicUser {
    const { id, email, fullName, avatarUrl, role, isVerified } = user;
    return { id, email, fullName, avatarUrl, role, isVerified };
  }
  private hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
  private hashResetCode(userId: string, code: string): string {
    return createHmac("sha256", this.jwtSecret).update(`${userId}:${code}`).digest("hex");
  }

  private generateOtp(): string {
    return randomInt(100000, 1000000).toString();
  }

  private otpMatches(expected: string, supplied: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);
    return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
  }
  private async sendOtpEmail(userId: string, email: string, otpCode: string): Promise<void> {
    try {
      await this.mailService.sendOtpEmail(email, otpCode);
    } catch (error) {
      // A failed delivery must not impose a resend cooldown for a code the user never received.
      await this.prisma.user.updateMany({
        where: { id: userId, otpCode, isVerified: false },
        data: { otpCode: null, otpExpiresAt: null },
      }).catch((cleanupError) => console.error("[auth-service] failed to clear undelivered OTP", cleanupError));
      if (error instanceof MailServiceError) {
        throw new AuthServiceError(error.message, error.code);
      }
      throw error;
    }
  }
}
