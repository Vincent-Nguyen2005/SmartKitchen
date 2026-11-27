import { Router, type Request, type Response } from "express";
import { PrismaClient, Role } from ".prisma/client-auth";
import { z } from "zod";
import { requireInternalKey } from "./internal-key";
import { hashPassword } from "../services/password";
import { isDatabaseUnavailable } from "../database-error";

/**
 * Shipper accounts (role SHIPPER), managed by admins. Internal only (x-api-key = INTERNAL_API_KEY): admin-service
 * checks the ADMIN role and writes the audit log; the gateway answers 404 for /internal/*.
 * - Created verified (no OTP), without a family, with the password the admin typed (same rule as sign-up, hashed
 *   with bcrypt like every account). Passwords are never returned or logged.
 * - Disabled accounts cannot sign in or refresh; their refresh tokens and sessions are removed at once.
 * GET /internal/shippers/:id/status lets shopping-list-service refuse shipper calls from disabled accounts.
 */
const PASSWORD = z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(128).refine(
  (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value),
  "Mật khẩu cần có chữ hoa, chữ thường và số",
);
const VN_PHONE = /^(?:\+84|84|0)(?:3|5|7|8|9|2\d)\d{8}$/;
const phone = z.string().trim().transform((value) => value.replace(/[\s.-]/g, "")).refine((value) => VN_PHONE.test(value), "Số điện thoại không hợp lệ");
const createBody = z.object({
  name: z.string().trim().min(1, "Nhập tên").max(100),
  phone,
  email: z.string().trim().toLowerCase().email("Email không hợp lệ").max(200),
  password: PASSWORD,
});
const statusBody = z.object({ active: z.boolean() });
const passwordBody = z.object({ password: PASSWORD });
const idParam = z.object({ id: z.string().uuid() });
const listQuery = z.object({ q: z.string().trim().max(200).optional() });

type ShipperRow = { id: string; email: string; fullName: string | null; phone: string | null; disabledAt: Date | null; createdAt: Date };
const SELECT = { id: true, email: true, fullName: true, phone: true, disabledAt: true, createdAt: true } as const;
export const shipperView = (user: ShipperRow) => ({
  id: user.id, name: user.fullName, phone: user.phone, email: user.email, active: user.disabledAt === null, createdAt: user.createdAt,
});

const fail = (res: Response, status: number, error: string, message: string, details?: unknown): void => {
  res.status(status).json({ error, message, ...(details ? { details } : {}) });
};
const failure = (res: Response, error: unknown, action: string): void => {
  // Never the request body (it may contain a password).
  console.error(JSON.stringify({ event: "shipper_admin_failed", action, code: (error as { code?: string }).code ?? null }));
  const unavailable = isDatabaseUnavailable(error);
  fail(res, unavailable ? 503 : 500, unavailable ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR", unavailable ? "Auth database is unavailable" : "Unable to update shipper accounts");
};

export const createShippersRouter = (prisma: PrismaClient): Router => {
  const router = Router();
  router.use(requireInternalKey);

  router.get("/admin/shippers", async (req: Request, res: Response) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) return fail(res, 400, "INVALID_QUERY", "q is invalid");
    const q = parsed.data.q;
    try {
      const users = await prisma.user.findMany({
        where: { role: Role.SHIPPER, ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}) },
        select: SELECT,
        orderBy: [{ disabledAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
        take: 500,
      });
      res.json({ items: users.map(shipperView) });
    } catch (error) {
      failure(res, error, "list");
    }
  });

  router.post("/admin/shippers", async (req: Request, res: Response) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid shipper", parsed.error.flatten().fieldErrors);
    const { name, phone: phoneNumber, email, password } = parsed.data;
    try {
      if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return fail(res, 409, "EMAIL_TAKEN", "Email đã được dùng cho tài khoản khác");
      const user = await prisma.user.create({
        data: { email, fullName: name, phone: phoneNumber, passwordHash: await hashPassword(password), role: Role.SHIPPER, isVerified: true },
        select: SELECT,
      });
      res.status(201).json({ shipper: shipperView(user) });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return fail(res, 409, "EMAIL_TAKEN", "Email đã được dùng cho tài khoản khác");
      failure(res, error, "create");
    }
  });

  router.patch("/admin/shippers/:id/status", async (req: Request, res: Response) => {
    const id = idParam.safeParse(req.params);
    const body = statusBody.safeParse(req.body);
    if (!id.success || !body.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request");
    try {
      const current = await prisma.user.findFirst({ where: { id: id.data.id, role: Role.SHIPPER }, select: SELECT });
      if (!current) return fail(res, 404, "NOT_FOUND", "Shipper not found");
      const user = await prisma.$transaction(async (transaction) => {
        const updated = await transaction.user.update({ where: { id: current.id }, data: { disabledAt: body.data.active ? null : current.disabledAt ?? new Date() }, select: SELECT });
        // Signed out everywhere at once: refresh tokens and sessions go.
        if (!body.data.active) {
          await transaction.refreshToken.deleteMany({ where: { userId: current.id } });
          await transaction.session.deleteMany({ where: { userId: current.id } });
        }
        return updated;
      });
      res.json({ shipper: shipperView(user) });
    } catch (error) {
      failure(res, error, "status");
    }
  });

  router.post("/admin/shippers/:id/password", async (req: Request, res: Response) => {
    const id = idParam.safeParse(req.params);
    const body = passwordBody.safeParse(req.body);
    if (!id.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request");
    if (!body.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid password", body.error.flatten().fieldErrors);
    try {
      const current = await prisma.user.findFirst({ where: { id: id.data.id, role: Role.SHIPPER }, select: { id: true } });
      if (!current) return fail(res, 404, "NOT_FOUND", "Shipper not found");
      const passwordHash = await hashPassword(body.data.password);
      const user = await prisma.$transaction(async (transaction) => {
        const updated = await transaction.user.update({ where: { id: current.id }, data: { passwordHash }, select: SELECT });
        // The old password's sessions end.
        await transaction.refreshToken.deleteMany({ where: { userId: current.id } });
        await transaction.session.deleteMany({ where: { userId: current.id } });
        return updated;
      });
      res.json({ shipper: shipperView(user) });
    } catch (error) {
      failure(res, error, "password");
    }
  });

  /** For shopping-list-service: is this account an active shipper? */
  router.get("/shippers/:id/status", async (req: Request, res: Response) => {
    const id = idParam.safeParse(req.params);
    if (!id.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid id");
    try {
      const user = await prisma.user.findUnique({ where: { id: id.data.id }, select: { role: true, disabledAt: true, fullName: true, phone: true } });
      res.json({ active: Boolean(user && user.role === Role.SHIPPER && !user.disabledAt), role: user?.role ?? null });
    } catch (error) {
      failure(res, error, "check");
    }
  });

  return router;
};
