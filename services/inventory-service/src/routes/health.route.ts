import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ service: "inventory-service", status: "ok" });
});

export default router;
