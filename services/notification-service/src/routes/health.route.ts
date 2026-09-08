import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ service: "notification-service", status: "ok" });
});

export default router;
