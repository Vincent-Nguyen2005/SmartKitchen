import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ status: "OK", service: "family-service", timestamp: new Date().toISOString() });
});

export default router;
