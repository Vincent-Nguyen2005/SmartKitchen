import { Router, type Response } from "express";
import { requireAdmin } from "../middleware/require-admin";

const router = Router();
router.use(requireAdmin);

const proxy = async (base: string, path: string, query: string, res: Response): Promise<void> => {
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
    res.status(response.status).json(body);
  } catch {
    // Got a response, but not a usable one.
    res.status(502).json({ error: "UPSTREAM_BAD_RESPONSE", message: "Directory service returned an invalid response" });
  }
};

router.get("/users", async (req, res) => {
  await proxy(process.env.AUTH_SERVICE_URL || "http://localhost:4001", "/internal/admin/users", req.url.slice(req.path.length), res);
});
router.get("/families", async (req, res) => {
  await proxy(process.env.FAMILY_SERVICE_URL || "http://localhost:4002", "/internal/admin/families", req.url.slice(req.path.length), res);
});
router.get("/families/:id", async (req, res) => {
  await proxy(process.env.FAMILY_SERVICE_URL || "http://localhost:4002", `/internal/admin/families/${encodeURIComponent(req.params.id)}`, req.url.slice(req.path.length), res);
});

export default router;
