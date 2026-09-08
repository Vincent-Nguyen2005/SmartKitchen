import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ service: "admin-service", status: "ok" });
});

export default router;
