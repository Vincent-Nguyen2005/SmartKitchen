import { randomBytes } from "crypto";
import { FamilyRole, InvitationStatus, Prisma, PrismaClient } from "@prisma/client";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class FamilyServiceError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "FamilyServiceError";
  }
}

export class FamilyService {
  constructor(private readonly prisma: PrismaClient) {}

  async createFamily(userId: string, name: string) {
    if (await this.prisma.familyMember.findFirst({ where: { userId } })) {
      throw new FamilyServiceError("You already belong to a family", 409);
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.prisma.familyGroup.create({
          data: {
            name,
            code: this.createJoinCode(),
            ownerId: userId,
            members: { create: { userId, role: FamilyRole.OWNER } },
          },
          include: { members: { orderBy: { joinedAt: "asc" } } },
        });
      } catch (error) {
        if (!this.isUniqueError(error)) throw error;
        const belongsToFamily = await this.prisma.familyMember.findFirst({ where: { userId } });
        if (belongsToFamily) throw new FamilyServiceError("You already belong to a family", 409);
        if (attempt === 4) throw new FamilyServiceError("Could not generate a unique family code", 503);
      }
    }
    throw new FamilyServiceError("Could not create family", 503);
  }

  async getMyFamily(userId: string) {
    const membership = await this.prisma.familyMember.findFirst({
      where: { userId },
      include: { family: { include: { members: { orderBy: { joinedAt: "asc" } } } } },
    });
    if (!membership) throw new FamilyServiceError("You do not belong to a family", 404);
    return { ...membership.family, currentUserRole: membership.role };
  }

  async leaveFamily(userId: string): Promise<void> {
    const membership = await this.prisma.familyMember.findFirst({ where: { userId } });
    if (!membership) throw new FamilyServiceError("You do not belong to a family", 404);
    if (membership.role === FamilyRole.OWNER) {
      throw new FamilyServiceError("The owner cannot leave before ownership is transferred", 409);
    }
    await this.prisma.familyMember.delete({ where: { id: membership.id } });
  }

  async invite(userId: string, email: string, requestedRole: FamilyRole = FamilyRole.MEMBER) {
    if (requestedRole === FamilyRole.OWNER) {
      throw new FamilyServiceError("Owner role cannot be assigned through an invitation", 400);
    }
    const { family, role: actorRole } = await this.requireManager(userId);
    if (actorRole === FamilyRole.ADMIN && requestedRole !== FamilyRole.MEMBER) {
      throw new FamilyServiceError("Admins can only invite members", 403);
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new FamilyServiceError("A valid invite email is required", 400);
    }

    const currentInvitation = await this.prisma.familyInvitation.findFirst({
      where: { familyId: family.id, email: normalizedEmail, status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } },
    });
    if (currentInvitation) throw new FamilyServiceError("An active invitation already exists for this email", 409);

    return this.prisma.familyInvitation.create({
      data: {
        familyId: family.id,
        email: normalizedEmail,
        role: requestedRole,
        token: randomBytes(32).toString("base64url"),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
      select: { id: true, familyId: true, email: true, role: true, token: true, status: true, expiresAt: true, createdAt: true },
    });
  }

  async join(userId: string, email: string | undefined, codeOrToken: string) {
    const value = codeOrToken.trim();
    if (!value) throw new FamilyServiceError("Invite code or token is required", 400);

    const invitation = await this.prisma.familyInvitation.findUnique({ where: { token: value } });
    let familyId: string;
    let role: FamilyRole = FamilyRole.MEMBER;
    if (invitation) {
      if (invitation.status !== InvitationStatus.PENDING) throw new FamilyServiceError("Invitation is no longer active", 410);
      if (invitation.expiresAt <= new Date()) {
        await this.prisma.familyInvitation.update({ where: { id: invitation.id }, data: { status: InvitationStatus.EXPIRED } });
        throw new FamilyServiceError("Invitation has expired", 410);
      }
      if (!email || invitation.email.toLowerCase() !== email.toLowerCase()) {
        throw new FamilyServiceError("This invitation belongs to a different email address", 403);
      }
      familyId = invitation.familyId;
      role = invitation.role;
    } else {
      const family = await this.prisma.familyGroup.findUnique({ where: { code: value.toUpperCase() }, select: { id: true } });
      if (!family) throw new FamilyServiceError("Invite code or token is invalid", 404);
      familyId = family.id;
    }

    if (await this.prisma.familyMember.findFirst({ where: { userId } })) {
      throw new FamilyServiceError("You already belong to a family", 409);
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const member = await transaction.familyMember.create({ data: { familyId, userId, role } });
        if (invitation) {
          await transaction.familyInvitation.update({ where: { id: invitation.id }, data: { status: InvitationStatus.ACCEPTED } });
        }
        return member;
      });
    } catch (error) {
      if (this.isUniqueError(error)) throw new FamilyServiceError("You already belong to this family", 409);
      throw error;
    }
  }

  async updateMemberRole(actorId: string, memberId: string, role: FamilyRole) {
    if (role === FamilyRole.OWNER) throw new FamilyServiceError("Ownership cannot be reassigned through this endpoint", 400);
    const { family, role: actorRole } = await this.requireManager(actorId);
    const target = await this.prisma.familyMember.findFirst({ where: { id: memberId, familyId: family.id } });
    if (!target) throw new FamilyServiceError("Family member not found", 404);
    if (target.role === FamilyRole.OWNER) throw new FamilyServiceError("The family owner role cannot be changed", 403);
    if (actorRole === FamilyRole.ADMIN && target.role !== FamilyRole.MEMBER) {
      throw new FamilyServiceError("Admins can only manage members", 403);
    }
    if (actorRole === FamilyRole.ADMIN && role === FamilyRole.ADMIN) {
      throw new FamilyServiceError("Only the owner can assign admin role", 403);
    }
    return this.prisma.familyMember.update({ where: { id: target.id }, data: { role } });
  }

  async removeMember(actorId: string, memberId: string): Promise<void> {
    const { family, role: actorRole } = await this.requireManager(actorId);
    const target = await this.prisma.familyMember.findFirst({ where: { id: memberId, familyId: family.id } });
    if (!target) throw new FamilyServiceError("Family member not found", 404);
    if (target.role === FamilyRole.OWNER) throw new FamilyServiceError("The family owner cannot be removed", 403);
    if (actorRole === FamilyRole.ADMIN && target.role !== FamilyRole.MEMBER) {
      throw new FamilyServiceError("Admins can only remove members", 403);
    }
    await this.prisma.familyMember.delete({ where: { id: target.id } });
  }

  private async requireManager(userId: string) {
    const membership = await this.prisma.familyMember.findFirst({
      where: { userId },
      include: { family: true },
    });
    if (!membership) throw new FamilyServiceError("You do not belong to a family", 404);
    if (membership.role !== FamilyRole.OWNER && membership.role !== FamilyRole.ADMIN) {
      throw new FamilyServiceError("Owner or admin permission is required", 403);
    }
    return { family: membership.family, role: membership.role };
  }

  private createJoinCode(): string {
    return Array.from(randomBytes(8), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
  }

  private isUniqueError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}