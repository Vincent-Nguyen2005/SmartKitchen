import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ status: "OK", service: "meal-diary-service", timestamp: new Date().toISOString() });
});

export default router;
