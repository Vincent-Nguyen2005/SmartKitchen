import { Router, type Request, type Response } from "express";
import type { PrismaClient } from ".prisma/client-admin";
import { adminUserId, requireAdmin } from "../middleware/require-admin";

/**
 * Quản trị › "Người giao hàng" (ADMIN only). Accounts live in auth-service (internal /internal/admin/shippers);
 * delivered counts and order release come from shopping-list-service (internal). Every change is written to the
 * audit log WITHOUT the password (create: name / phone / email; reset: only that it happened).
 * - Disable: auth-service blocks sign-in / refresh at once; the shipper's orders being delivered (SHIPPING) go back to
 *   PENDING with no shipper, so another shipper can take them (their Kho rows stay "Đang giao").
 */
type Fetch = typeof fetch;
const internalKey = (): string | null => {
  const key = process.env.INTERNAL_API_KEY;
  return key && key.length >= 32 ? key : null;
};
const authUrl = () => (process.env.AUTH_SERVICE_URL || "http://localhost:4001").replace(/\/+$/, "");
const shoppingUrl = () => (process.env.SHOPPING_LIST_SERVICE_URL || "http://localhost:4008").replace(/\/+$/, "");

export const createShippersRouter = (prisma: Pick<PrismaClient, "auditLog">, fetcher: Fetch = fetch): Router => {
  const router = Router();
  router.use("/shippers", requireAdmin);

  const call = async (base: string, path: string, init: { method?: string; body?: unknown } = {}) => {
    const key = internalKey();
    if (!key) return { status: 503, body: { error: "INTERNAL_NOT_CONFIGURED", message: "Internal API key is not configured" } };
    try {
      const response = await fetcher(`${base}${path}`, {
        method: init.method ?? "GET",
        headers: { "x-api-key": key, "content-type": "application/json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(8000),
      });
      return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, unknown> };
    } catch {
      return { status: 503, body: { error: "UPSTREAM_UNAVAILABLE", message: "Service unavailable" } };
    }
  };
  const audit = (request: Request, action: string, targetId: string | null, metadata: Record<string, unknown>) =>
    prisma.auditLog.create({ data: { adminUserId: adminUserId(request), action, targetType: "ShipperAccount", targetId, metadata: metadata as object } });

  router.get("/shippers", async (request: Request, response: Response) => {
    const q = typeof request.query.q === "string" ? `?q=${encodeURIComponent(request.query.q)}` : "";
    const accounts = await call(authUrl(), `/internal/admin/shippers${q}`);
    if (accounts.status !== 200) return response.status(accounts.status).json(accounts.body);
    const items = (accounts.body.items as Array<{ id: string }> | undefined) ?? [];
    // Delivered counts: best effort (the list still shows without them).
    const stats = items.length > 0 ? await call(shoppingUrl(), `/internal/shippers/stats?ids=${items.map((item) => item.id).join(",")}`) : { status: 200, body: { items: [] } };
    const delivered = new Map(((stats.body.items as Array<{ shipperId: string; delivered: number }> | undefined) ?? []).map((row) => [row.shipperId, row.delivered]));
    return response.json({ items: items.map((item) => ({ ...item, deliveredCount: stats.status === 200 ? delivered.get(item.id) ?? 0 : null })) });
  });

  router.post("/shippers", async (request: Request, response: Response) => {
    const created = await call(authUrl(), "/internal/admin/shippers", { method: "POST", body: request.body });
    if (created.status === 201) {
      const shipper = created.body.shipper as { id: string; name: string; phone: string; email: string };
      await audit(request, "SHIPPER_CREATE", shipper.id, { name: shipper.name, phone: shipper.phone, email: shipper.email });
    }
    return response.status(created.status).json(created.body);
  });

  router.patch("/shippers/:id/status", async (request: Request, response: Response) => {
    const id = encodeURIComponent(request.params.id);
    const active = request.body?.active === true;
    const updated = await call(authUrl(), `/internal/admin/shippers/${id}/status`, { method: "PATCH", body: { active: request.body?.active } });
    if (updated.status !== 200) return response.status(updated.status).json(updated.body);
    let released: number | null = null;
    if (!active) {
      const release = await call(shoppingUrl(), `/internal/shippers/${id}/release`, { method: "POST", body: {} });
      released = release.status === 200 ? Number(release.body.released ?? 0) : null;
    }
    await audit(request, active ? "SHIPPER_ENABLE" : "SHIPPER_DISABLE", request.params.id, active ? {} : { releasedOrders: released });
    return response.json({ ...updated.body, releasedOrders: released });
  });

  router.post("/shippers/:id/password", async (request: Request, response: Response) => {
    const reset = await call(authUrl(), `/internal/admin/shippers/${encodeURIComponent(request.params.id)}/password`, { method: "POST", body: request.body });
    // Only that it happened: never the password.
    if (reset.status === 200) await audit(request, "SHIPPER_PASSWORD_RESET", request.params.id, {});
    return response.status(reset.status).json(reset.body);
  });

  return router;
};
