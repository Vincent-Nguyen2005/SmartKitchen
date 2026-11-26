import { randomBytes } from "crypto";
import { FamilyRole, InvitationStatus, Prisma, PrismaClient } from ".prisma/client-family";
import { assignableRole, effectiveRole } from "./roles";
import { lookupProfiles } from "./user-profiles";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class FamilyServiceError extends Error {
  /** `code`: optional machine-readable reason for the app (e.g. QR_EXPIRED, ALREADY_MEMBER). */
  constructor(message: string, readonly statusCode: number, readonly code?: string) {
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
            codeExpiresAt: new Date(Date.now() + INVITATION_TTL_MS),
            ownerId: userId,
            members: { create: { userId, role: FamilyRole.OWNER } },
            settings: { create: {} },
          },
          include: { members: { orderBy: { joinedAt: "asc" } }, settings: true },
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
    const profiles = await lookupProfiles(membership.family.members.map((member) => member.userId));
    return {
      ...membership.family,
      members: membership.family.members.map((member) => ({
        ...member,
        role: effectiveRole(member.role),
        displayName: profiles.get(member.userId)?.name?.trim() || profiles.get(member.userId)?.email.split("@")[0] || null,
        email: profiles.get(member.userId)?.email ?? null,
        avatarUrl: profiles.get(member.userId)?.avatarUrl ?? null,
      })),
      currentUserRole: effectiveRole(membership.role),
    };
  }

  async getFamilySettings(userId: string) {
    const membership = await this.prisma.familyMember.findFirst({ where: { userId }, select: { familyId: true } });
    if (!membership) throw new FamilyServiceError("You do not belong to a family", 404);
    const settings = await this.prisma.familySettings.upsert({
      where: { familyId: membership.familyId },
      create: { familyId: membership.familyId },
      update: {},
    });
    return this.serializeSettings(settings);
  }

  async updateFamilySettings(userId: string, updates: Prisma.FamilySettingsUpdateInput) {
    const { family } = await this.requireOwner(userId);
    await this.prisma.familySettings.upsert({
      where: { familyId: family.id },
      create: { familyId: family.id },
      update: {},
    });
    const settings = await this.prisma.familySettings.update({ where: { familyId: family.id }, data: updates });
    return this.serializeSettings(settings);
  }

  async leaveFamily(userId: string): Promise<void> {
    const membership = await this.prisma.familyMember.findFirst({
      where: { userId },
      include: { family: { select: { ownerId: true } } },
    });
    if (!membership) throw new FamilyServiceError("You do not belong to a family", 404);
    if (membership.role === FamilyRole.OWNER || membership.family.ownerId === userId) {
      throw new FamilyServiceError("The owner cannot leave before ownership is transferred", 409);
    }
    await this.prisma.familyMember.delete({ where: { id: membership.id } });
  }

  async regenerateJoinCode(userId: string) {
    const { family } = await this.requireOwner(userId);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.prisma.familyGroup.update({
          where: { id: family.id },
          data: { code: this.createJoinCode(), codeExpiresAt: new Date(Date.now() + INVITATION_TTL_MS) },
          select: { id: true, code: true, codeExpiresAt: true },
        });
      } catch (error) {
        if (!this.isUniqueError(error)) throw error;
        if (attempt === 4) throw new FamilyServiceError("Could not generate a unique family code", 503);
      }
    }
    throw new FamilyServiceError("Could not generate a unique family code", 503);
  }

  async verifyInvitation(codeOrToken: string) {
    const value = codeOrToken.trim();
    if (!value) throw new FamilyServiceError("Invite code or token is required", 400);

    const invitation = await this.prisma.familyInvitation.findUnique({
      where: { token: value },
      include: { family: { select: { id: true, name: true } } },
    });
    if (invitation) {
      if (invitation.status !== InvitationStatus.PENDING) throw new FamilyServiceError("Invitation is no longer active", 410);
      if (invitation.expiresAt <= new Date()) {
        await this.prisma.familyInvitation.update({ where: { id: invitation.id }, data: { status: InvitationStatus.EXPIRED } });
        throw new FamilyServiceError("Invitation has expired", 410);
      }
      return {
        type: "invitation" as const,
        family: invitation.family,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      };
    }

    const family = await this.prisma.familyGroup.findUnique({ where: { code: value.toUpperCase() } });
    if (!family) throw new FamilyServiceError("Invite code or token is invalid", 404);
    if (family.codeExpiresAt <= new Date()) throw new FamilyServiceError("Family join code has expired", 410);
    return { type: "join-code" as const, family: { id: family.id, name: family.name }, expiresAt: family.codeExpiresAt };
  }

  async invite(userId: string, email: string, requestedRole: FamilyRole = FamilyRole.MEMBER) {
    if (requestedRole === FamilyRole.OWNER) {
      throw new FamilyServiceError("Owner role cannot be assigned through an invitation", 400);
    }
    if (!assignableRole(requestedRole)) throw new FamilyServiceError("Family roles are owner and member only", 400);
    const { family } = await this.requireOwner(userId);

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
      // An old invitation made for ADMIN joins as a member (and never as owner).
      role = invitation.role === FamilyRole.OWNER ? FamilyRole.MEMBER : effectiveRole(invitation.role);
    } else {
      const family = await this.prisma.familyGroup.findUnique({ where: { code: value.toUpperCase() }, select: { id: true, codeExpiresAt: true } });
      if (!family) throw new FamilyServiceError("Invite code or token is invalid", 404);
      if (family.codeExpiresAt <= new Date()) throw new FamilyServiceError("Family join code has expired", 410);
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
    // No family admins any more: the only role that can be set is MEMBER (it turns a leftover ADMIN into a member).
    if (!assignableRole(role)) throw new FamilyServiceError("Family roles are owner and member only", 400);
    const { family } = await this.requireOwner(actorId);
    const target = await this.prisma.familyMember.findFirst({ where: { id: memberId, familyId: family.id } });
    if (!target) throw new FamilyServiceError("Family member not found", 404);
    if (target.role === FamilyRole.OWNER || target.userId === family.ownerId) {
      throw new FamilyServiceError("The family owner role cannot be changed", 403);
    }
    const updated = await this.prisma.familyMember.update({ where: { id: target.id }, data: { role } });
    return { ...updated, role: effectiveRole(updated.role) };
  }

  async transferOwnership(actorId: string, memberId: string) {
    const { family } = await this.requireOwner(actorId);

    return this.prisma.$transaction(async (transaction) => {
      const target = await transaction.familyMember.findFirst({
        where: { id: memberId, familyId: family.id },
      });
      if (!target) throw new FamilyServiceError("Family member not found", 404);
      if (target.userId === actorId) throw new FamilyServiceError("You already own this family", 400);
      if (target.role === FamilyRole.OWNER) {
        throw new FamilyServiceError("Ownership can only be transferred to a member", 400);
      }

      const transfer = await transaction.familyGroup.updateMany({
        where: { id: family.id, ownerId: actorId },
        data: { ownerId: target.userId },
      });
      if (transfer.count !== 1) {
        throw new FamilyServiceError("Family ownership has already changed; refresh and try again", 409);
      }

      const newOwner = await transaction.familyMember.update({
        where: { id: target.id },
        data: { role: FamilyRole.OWNER },
      });
      // The previous owner becomes a member (there are no family admins).
      await transaction.familyMember.update({
        where: { familyId_userId: { familyId: family.id, userId: actorId } },
        data: { role: FamilyRole.MEMBER },
      });
      return newOwner;
    });
  }

  async removeMember(actorId: string, memberId: string): Promise<void> {
    const { family } = await this.requireOwner(actorId);
    const target = await this.prisma.familyMember.findFirst({ where: { id: memberId, familyId: family.id } });
    if (!target) throw new FamilyServiceError("Family member not found", 404);
    if (target.role === FamilyRole.OWNER || target.userId === family.ownerId) {
      throw new FamilyServiceError("The family owner cannot be removed", 403);
    }
    await this.prisma.familyMember.delete({ where: { id: target.id } });
  }

  /** Management actions (invite, join code, settings, roles, remove, transfer) are the owner's alone. */
  private async requireOwner(userId: string) {
    const membership = await this.prisma.familyMember.findFirst({
      where: { userId },
      include: { family: true },
    });
    if (!membership) throw new FamilyServiceError("You do not belong to a family", 404);
    if (effectiveRole(membership.role) !== FamilyRole.OWNER) {
      throw new FamilyServiceError("Only the family owner can do this", 403);
    }
    return { family: membership.family, role: membership.role };
  }

  private serializeSettings<T extends { monthlyBudget: Prisma.Decimal | null }>(settings: T) {
    return {
      ...settings,
      monthlyBudget: settings.monthlyBudget === null ? null : Number(settings.monthlyBudget),
    };
  }

  private createJoinCode(): string {
    return Array.from(randomBytes(8), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
  }

  private isUniqueError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
