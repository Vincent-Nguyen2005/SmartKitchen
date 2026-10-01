import { Request, Response } from "express";
import { FamilyRole } from "@prisma/client";
import { z } from "zod";
import { FamilyService, FamilyServiceError } from "../services/family.service";

export type AuthenticatedRequest = Request & { authUser: { userId: string; email?: string } };

const createFamilySchema = z.object({ name: z.string().trim().min(2).max(80) });
const inviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.nativeEnum(FamilyRole).optional().default(FamilyRole.MEMBER),
});
const joinSchema = z.object({ code: z.string().trim().min(6).max(200).optional(), token: z.string().trim().min(16).max(200).optional() })
  .refine(({ code, token }) => Boolean(code || token), { message: "Provide an invite code or invitation token" });
const roleSchema = z.object({ role: z.nativeEnum(FamilyRole) });

export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  create = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const input = createFamilySchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: "Invalid family details", details: input.error.flatten().fieldErrors });
      return;
    }
    try {
      res.status(201).json({ family: await this.familyService.createFamily(req.authUser.userId, input.data.name) });
    } catch (error) { this.respondError(res, error); }
  };

  me = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      res.json({ family: await this.familyService.getMyFamily(req.authUser.userId) });
    } catch (error) { this.respondError(res, error); }
  };

  leave = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await this.familyService.leaveFamily(req.authUser.userId);
      res.status(204).send();
    } catch (error) { this.respondError(res, error); }
  };

  invite = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const input = inviteSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: "Invalid invitation details", details: input.error.flatten().fieldErrors });
      return;
    }
    try {
      res.status(201).json({ invitation: await this.familyService.invite(req.authUser.userId, input.data.email, input.data.role) });
    } catch (error) { this.respondError(res, error); }
  };

  join = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const input = joinSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: "Invalid join details", details: input.error.flatten().fieldErrors });
      return;
    }
    try {
      const codeOrToken = input.data.token ?? input.data.code!;
      res.status(201).json({ membership: await this.familyService.join(req.authUser.userId, req.authUser.email, codeOrToken) });
    } catch (error) { this.respondError(res, error); }
  };

  updateRole = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const input = roleSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: "Invalid member role", details: input.error.flatten().fieldErrors });
      return;
    }
    try {
      res.json({ member: await this.familyService.updateMemberRole(req.authUser.userId, req.params.memberId, input.data.role) });
    } catch (error) { this.respondError(res, error); }
  };

  removeMember = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await this.familyService.removeMember(req.authUser.userId, req.params.memberId);
      res.status(204).send();
    } catch (error) { this.respondError(res, error); }
  };

  private respondError(res: Response, error: unknown): void {
    if (error instanceof FamilyServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error("[family-service] request failed", error);
    res.status(500).json({ error: "An unexpected error occurred" });
  }
}