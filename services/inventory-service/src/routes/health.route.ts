<<<<<<< HEAD
import { Router } from "express";
=======
﻿import { Router } from "express";
>>>>>>> origin/main

const router = Router();

router.get("/", (_req, res) => {
  res.json({ status: "OK", service: "inventory-service", timestamp: new Date().toISOString() });
});

export default router;
