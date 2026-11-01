import { Request, Response } from "express";
import { z } from "zod";
import { AuthService } from "../services/auth.service";

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

const registerSchema = credentialsSchema.extend({
  fullName: z.string().trim().min(2).max(100).optional(),
}).superRefine(({ password }, context) => {
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "Password must include upper, lower, and numeric characters" });
  }
});

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = async (req: Request, res: Response): Promise<void> => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid registration data", details: parsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const result = await this.authService.register(parsed.data.email.toLowerCase(), parsed.data.password, parsed.data.fullName);
      res.status(201).json(result);
    } catch (error) {
      if (this.isPrismaUniqueError(error)) {
        res.status(409).json({ error: "Email is already registered" });
        return;
      }
      res.status(500).json({ error: "Unable to register user" });
    }
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid login data", details: parsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const result = await this.authService.login(parsed.data.email.toLowerCase(), parsed.data.password, {
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      res.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_CREDENTIALS") {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }
      res.status(500).json({ error: "Unable to log in" });
    }
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    await this.authService.logout(req.body?.refreshToken, this.getBearerToken(req));
    res.status(204).send();
  };

  me = async (req: Request, res: Response): Promise<void> => {
    const token = this.getBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const payload = this.authService.verifyAccessToken(token);
      const user = await this.authService.getUser(payload.sub);
      if (!user) {
        res.status(401).json({ error: "User not found" });
        return;
      }
      res.json({ user });
    } catch {
      res.status(401).json({ error: "Invalid or expired access token" });
    }
  };

  private getBearerToken(req: Request): string | undefined {
    const header = req.get("authorization");
    return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  }

  private isPrismaUniqueError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
  }
}