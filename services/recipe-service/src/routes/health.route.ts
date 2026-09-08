import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ service: "recipe-service", status: "ok" });
});

export default router;
