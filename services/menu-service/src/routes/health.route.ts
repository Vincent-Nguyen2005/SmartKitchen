import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ service: "menu-service", status: "ok" });
});

export default router;
