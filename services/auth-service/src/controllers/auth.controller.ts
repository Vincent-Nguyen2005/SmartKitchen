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

const googleRequestSchema = z.object({
  idToken: z.string().min(1).optional(),
  accessToken: z.string().min(1).optional(),
}).refine(({ idToken, accessToken }) => Boolean(idToken || accessToken), {
  message: "Provide a Google ID token or access token",
});

const googleTokenInfoSchema = z.object({
  email: z.string().email(),
  email_verified: z.union([z.boolean(), z.string()]).optional(),
  verified_email: z.boolean().optional(),
  aud: z.string().optional(),
  audience: z.string().optional(),
  issued_to: z.string().optional(),
  iss: z.string().optional(),
  exp: z.union([z.string(), z.number()]).optional(),
  expires_in: z.union([z.string(), z.number()]).optional(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
}).passthrough();

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

  google = async (req: Request, res: Response): Promise<void> => {
    const parsed = googleRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid Google sign-in request", details: parsed.error.flatten().fieldErrors });
      return;
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      res.status(503).json({ error: "Google sign-in is not configured" });
      return;
    }

    const isIdToken = Boolean(parsed.data.idToken);
    const googleToken = parsed.data.idToken ?? parsed.data.accessToken!;
    const endpoint = isIdToken
      ? `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(googleToken)}`
      : `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(googleToken)}`;

    let tokenInfo: z.infer<typeof googleTokenInfoSchema>;
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        res.status(401).json({ error: "Google token is invalid or expired" });
        return;
      }
      const parsedToken = googleTokenInfoSchema.safeParse(await response.json());
      if (!parsedToken.success) {
        res.status(401).json({ error: "Google token profile is invalid" });
        return;
      }
      tokenInfo = parsedToken.data;
    } catch {
      res.status(502).json({ error: "Unable to verify Google token" });
      return;
    }

    const audiences = [tokenInfo.aud, tokenInfo.audience, tokenInfo.issued_to].filter((value): value is string => Boolean(value));
    const verifiedEmail = tokenInfo.email_verified === true || tokenInfo.email_verified === "true" || tokenInfo.verified_email === true;
    const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
    const issuerIsValid = isIdToken
      ? validIssuers.includes(tokenInfo.iss ?? "")
      : !tokenInfo.iss || validIssuers.includes(tokenInfo.iss);
    const expiration = tokenInfo.exp === undefined ? NaN : Number(tokenInfo.exp);
    const hasValidExpiration = isIdToken
      ? Number.isFinite(expiration) && expiration > Math.floor(Date.now() / 1000)
      : Number(tokenInfo.expires_in) > 0;

    if (!audiences.includes(clientId) || !verifiedEmail || !issuerIsValid || !hasValidExpiration) {
      res.status(401).json({ error: "Google token is not valid for this application" });
      return;
    }

    try {
      const result = await this.authService.loginWithGoogle({ email: tokenInfo.email, fullName: tokenInfo.name, avatarUrl: tokenInfo.picture });
      res.json(result);
    } catch {
      res.status(500).json({ error: "Unable to complete Google sign-in" });
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