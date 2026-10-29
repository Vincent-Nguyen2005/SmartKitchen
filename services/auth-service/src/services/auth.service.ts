import argon2 from "argon2";
import { createHash, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { Prisma, PrismaClient, Role, User } from "@prisma/client";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PublicUser = Pick<User, "id" | "email" | "fullName" | "avatarUrl" | "role" | "isVerified">;

export type AuthResult = {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
};

export type AccessTokenPayload = jwt.JwtPayload & { sub: string; email: string; role: Role };

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtSecret = process.env.JWT_SECRET || "development-only-secret",
  ) {}

  async register(email: string, password: string, fullName?: string): Promise<AuthResult> {
    const passwordHash = await argon2.hash(password);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, fullName: fullName || null },
    });

    return this.issueTokens(user);
  }

  async login(email: string, password: string, requestContext?: { ipAddress?: string; userAgent?: string }): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new Error("INVALID_CREDENTIALS");
    }

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

    return this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.refreshToken.deleteMany({ where: { id: storedToken.id, expiresAt: { gt: new Date() } } });
      if (revoked.count !== 1) throw new Error("INVALID_REFRESH_TOKEN");
      return this.issueTokens(storedToken.user, requestContext, transaction);
    });
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
      expiresIn: ACCESS_TOKEN_TTL,
    });
    const refreshToken = randomBytes(48).toString("hex");

    const tokenWrite = transaction.refreshToken.create({
        data: { token: this.hashRefreshToken(refreshToken), userId: user.id, expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS) },
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
}