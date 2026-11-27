import { Router, type Response } from "express";
import { requireAdmin } from "../middleware/require-admin";

const router = Router();
router.use(requireAdmin);

type Body = Record<string, unknown>;
/**
 * Families as an admin sees them: id, name, member count and created date only. family-service also returns the
 * owner email and the member list (names, emails); they are dropped here so no member data reaches the app.
 */
const familyView = (family: Body): Body => ({
  id: family.id,
  name: family.name,
  memberCount: typeof family.memberCount === "number" ? family.memberCount : Array.isArray(family.members) ? family.members.length : 0,
  createdAt: family.createdAt,
});
export const familyListView = (body: Body): Body => (Array.isArray(body.items) ? { ...body, items: (body.items as Body[]).map(familyView) } : body);
export const familyDetailView = (body: Body): Body => (typeof body.id === "string" ? familyView(body) : body);

const proxy = async (base: string, path: string, query: string, res: Response, view?: (body: Body) => Body): Promise<void> => {
  const key = process.env.INTERNAL_API_KEY;
  if (!key || key.length < 32) {
    res.status(503).json({ error: "INTERNAL_NOT_CONFIGURED", message: "Internal API key is not configured" });
    return;
  }
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}${path}${query}`, {
      headers: { "x-api-key": key }, signal: AbortSignal.timeout(5000),
    });
  } catch {
    // No HTTP response at all (ECONNREFUSED, ETIMEDOUT, DNS, abort): upstream unreachable.
    res.status(503).json({ error: "UPSTREAM_UNAVAILABLE", message: "Directory service unavailable" });
    return;
  }
  try {
    const body = await response.json();
    // Success bodies only; error bodies pass through unchanged.
    res.status(response.status).json(view && response.ok && body && typeof body === "object" ? view(body as Body) : body);
  } catch {
    // Got a response, but not a usable one.
    res.status(502).json({ error: "UPSTREAM_BAD_RESPONSE", message: "Directory service returned an invalid response" });
  }
};

router.get("/users", async (req, res) => {
  await proxy(process.env.AUTH_SERVICE_URL || "http://localhost:4001", "/internal/admin/users", req.url.slice(req.path.length), res);
});
router.get("/families", async (req, res) => {
  await proxy(process.env.FAMILY_SERVICE_URL || "http://localhost:4002", "/internal/admin/families", req.url.slice(req.path.length), res, familyListView);
});
router.get("/families/:id", async (req, res) => {
  await proxy(process.env.FAMILY_SERVICE_URL || "http://localhost:4002", `/internal/admin/families/${encodeURIComponent(req.params.id)}`, req.url.slice(req.path.length), res, familyDetailView);
});

export default router;
