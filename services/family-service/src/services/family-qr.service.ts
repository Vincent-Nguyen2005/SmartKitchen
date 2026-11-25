import { createHash, randomBytes } from "crypto";
import { FamilyRole, Prisma, PrismaClient } from ".prisma/client-family";
import { FamilyServiceError } from "./family.service";

/**
 * "QR gia đình": the family owner shows a one-time join QR; other users scan it and join.
 * - Only the owner creates / revokes it (403 NOT_OWNER otherwise).
 * - One token per family: a new one replaces (revokes) the previous one.
 * - The app revokes it when the owner's sheet closes; it also expires QR_TOKEN_TTL_MS after creation.
 * - The QR holds a random opaque token (QR_PREFIX + token), never the family id; only its SHA-256 is stored.
 * - While valid it can be used by several people (several members may join while it is shown).
 * - A user belongs to one family at most (current family rules): no switching through a QR.
 */
export const QR_TOKEN_TTL_MS = 10 * 60 * 1000;
export const QR_PREFIX = "smartkitchen://join?t=";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
const qrError = (message: string, statusCode: number, code: string) => new FamilyServiceError(message, statusCode, code);
const expired = () => qrError("Mã QR đã hết hạn, nhờ chủ nhà mở lại mã", 410, "QR_EXPIRED");

/** Token from a scanned value: the full "smartkitchen://join?t=..." text or the bare token; null when malformed. */
export function tokenFromScan(value: string): string | null {
  const trimmed = value.trim();
  const token = trimmed.startsWith(QR_PREFIX) ? trimmed.slice(QR_PREFIX.length) : trimmed;
  return TOKEN_PATTERN.test(token) ? token : null;
}

export class FamilyQrService {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  private async requireOwner(userId: string) {
    const membership = await this.prisma.familyMember.findFirst({ where: { userId }, include: { family: { select: { id: true, name: true, ownerId: true } } } });
    if (!membership) throw qrError("You do not belong to a family", 404, "NO_FAMILY");
    if (membership.role !== FamilyRole.OWNER && membership.family.ownerId !== userId) throw qrError("Only the family owner can show the family QR", 403, "NOT_OWNER");
    return membership.family;
  }

  /** A fresh token for the owner's family; any previous one stops working. */
  async create(userId: string) {
    const family = await this.requireOwner(userId);
    const token = randomBytes(24).toString("base64url");
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + QR_TOKEN_TTL_MS);
    await this.prisma.familyQrToken.upsert({
      where: { familyId: family.id },
      create: { familyId: family.id, tokenHash: hashToken(token), createdAt, expiresAt },
      update: { tokenHash: hashToken(token), createdAt, expiresAt },
    });
    return { token, payload: `${QR_PREFIX}${token}`, expiresAt, family: { id: family.id, name: family.name } };
  }

  /** Owner closed the sheet: the token stops working now. With `token`, only that one (a newer one stays). */
  async revoke(userId: string, token?: string) {
    const family = await this.requireOwner(userId);
    const removed = await this.prisma.familyQrToken.deleteMany({ where: { familyId: family.id, ...(token ? { tokenHash: hashToken(token) } : {}) } });
    return { revoked: removed.count > 0 };
  }

  private async familyFor(rawToken: string) {
    const token = tokenFromScan(rawToken);
    if (!token) throw expired();
    const row = await this.prisma.familyQrToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { family: { select: { id: true, name: true } } } });
    if (!row || row.expiresAt <= this.now()) throw expired();
    return row.family;
  }

  /** Before the "Tham gia gia đình …?" dialog: the family's name and where the user stands. */
  async verify(userId: string, rawToken: string) {
    const family = await this.familyFor(rawToken);
    const membership = await this.prisma.familyMember.findFirst({ where: { userId }, select: { familyId: true } });
    return { family, membership: !membership ? "none" as const : membership.familyId === family.id ? "this" as const : "other" as const };
  }

  /** Joins as MEMBER while the token is still valid. */
  async join(userId: string, rawToken: string) {
    const family = await this.familyFor(rawToken);
    const membership = await this.prisma.familyMember.findFirst({ where: { userId }, select: { familyId: true } });
    if (membership?.familyId === family.id) throw qrError("Bạn đã ở trong gia đình này", 409, "ALREADY_MEMBER");
    if (membership) throw qrError("Bạn đang ở một gia đình khác. Hãy rời gia đình đó trước khi tham gia gia đình mới.", 409, "OTHER_FAMILY");
    try {
      const member = await this.prisma.familyMember.create({ data: { familyId: family.id, userId, role: FamilyRole.MEMBER } });
      return { membership: member, family };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw qrError("Bạn đã ở trong gia đình này", 409, "ALREADY_MEMBER");
      throw error;
    }
  }
}
