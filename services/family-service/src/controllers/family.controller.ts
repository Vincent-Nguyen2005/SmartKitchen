import { Request, Response } from "express";
import { FamilyRole } from ".prisma/client-family";
import { z } from "zod";
import { FamilyService, FamilyServiceError } from "../services/family.service";
import { isDatabaseUnavailable } from "../database-error";
import { ProfileLookupError } from "../services/user-profiles";

export type AuthenticatedRequest = Request & { authUser: { userId: string; email?: string } };

const createFamilySchema = z.object({ name: z.string().trim().min(2).max(80) });
const inviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.nativeEnum(FamilyRole).optional().default(FamilyRole.MEMBER),
});
const joinSchema = z.object({ code: z.string().trim().min(6).max(200).optional(), token: z.string().trim().min(16).max(200).optional() })
  .refine(({ code, token }) => Boolean(code || token), { message: "Provide an invite code or invitation token" });
const roleSchema = z.object({ role: z.nativeEnum(FamilyRole) });
const transferOwnershipSchema = z.object({ memberId: z.string().uuid() });
const settingsUpdateSchema = z.object({
  defaultDietaryRestrictions: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  monthlyBudget: z.number().finite().min(0).max(99999999.99).nullable().optional(),
  householdRules: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "Provide at least one family setting" });
const verifyInvitationSchema = z.object({ code: z.string().trim().min(6).max(200).optional(), token: z.string().trim().min(16).max(200).optional() })
  .refine(({ code, token }) => Boolean(code || token), { message: "Provide an invite code or invitation token" });

export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  create = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const input = createFamilySchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ success: false, error: "Invalid family details", details: input.error.flatten().fieldErrors });
      return;
    }
    try {
      res.status(201).json({ success: true, data: { family: await this.familyService.createFamily(req.authUser.userId, input.data.name) } });
    } catch (error) { this.respondError(res, error); }
  };

  me = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      res.json({ success: true, data: { family: await this.familyService.getMyFamily(req.authUser.userId) } });
    } catch (error) { this.respondError(res, error); }
  };

  leave = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await this.familyService.leaveFamily(req.authUser.userId);
      res.json({ success: true, data: {} });
    } catch (error) { this.respondError(res, error); }
  };

  invite = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const input = inviteSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ success: false, error: "Invalid invitation details", details: input.error.flatten().fieldErrors });
      return;
    }
    try {
      res.status(201).json({ success: true, data: { invitation: await this.familyService.invite(req.authUser.userId, input.data.email, input.data.role) } });
    } catch (error) { this.respondError(res, error); }
  };

  regenerateJoinCode = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      res.json({ success: true, data: { joinCode: await this.familyService.regenerateJoinCode(req.authUser.userId) } });
    } catch (error) { this.respondError(res, error); }
  };

  verifyInvitation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const input = verifyInvitationSchema.safeParse(req.query);
    if (!input.success) {
      res.status(400).json({ success: false, error: "Invalid invitation verification request", details: input.error.flatten().fieldErrors });
      return;
    }
    try {
      const codeOrToken = input.data.token ?? input.data.code!;
      res.json({ success: true, data: { invitation: await this.familyService.verifyInvitation(codeOrToken) } });
    } catch (error) { this.respondError(res, error); }
  };

  join = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const input = joinSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ success: false, error: "Invalid join details", details: input.error.flatten().fieldErrors });
      return;
    }
    try {
      const codeOrToken = input.data.token ?? input.data.code!;
      res.status(201).json({ success: true, data: { membership: await this.familyService.join(req.authUser.userId, req.authUser.email, codeOrToken) } });
    } catch (error) { this.respondError(res, error); }
  };

  updateRole = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const input = roleSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ success: false, error: "Invalid member role", details: input.error.flatten().fieldErrors });
      return;
    }
    try {
      res.json({ success: true, data: { member: await this.familyService.updateMemberRole(req.authUser.userId, req.params.memberId, input.data.role) } });
    } catch (error) { this.respondError(res, error); }
  };

  removeMember = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await this.familyService.removeMember(req.authUser.userId, req.params.memberId);
      res.json({ success: true, data: {} });
    } catch (error) { this.respondError(res, error); }
  };

  transferOwnership = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const input = transferOwnershipSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ success: false, error: "Invalid ownership transfer details", details: input.error.flatten().fieldErrors });
      return;
    }
    try {
      res.json({ success: true, data: { member: await this.familyService.transferOwnership(req.authUser.userId, input.data.memberId) } });
    } catch (error) { this.respondError(res, error); }
  };

  getSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      res.json({ success: true, data: { settings: await this.familyService.getFamilySettings(req.authUser.userId) } });
    } catch (error) { this.respondError(res, error); }
  };

  updateSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const input = settingsUpdateSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ success: false, error: "Invalid family settings", details: input.error.flatten().fieldErrors });
      return;
    }
    try {
      res.json({ success: true, data: { settings: await this.familyService.updateFamilySettings(req.authUser.userId, input.data) } });
    } catch (error) { this.respondError(res, error); }
  };

  private respondError(res: Response, error: unknown): void {
    if (error instanceof ProfileLookupError) {
      res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Unable to load member profiles" });
      return;
    }
    if (error instanceof FamilyServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    console.error("[family-service] request failed", error);
    if (isDatabaseUnavailable(error)) {
      res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Family database is unavailable" });
      return;
    }
    res.status(500).json({ success: false, error: "An unexpected error occurred" });
  }
}
