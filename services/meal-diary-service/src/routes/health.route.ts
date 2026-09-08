import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ service: "meal-diary-service", status: "ok" });
});

export default router;
