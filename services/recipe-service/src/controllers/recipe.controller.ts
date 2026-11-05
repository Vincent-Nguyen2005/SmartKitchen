import { Router } from "express";
import { listActiveRecipes } from "../services/recipe.service";

const router = Router();

router.get("/", async (_request, response) => {
  try {
    response.json(await listActiveRecipes());
  } catch {
    response.status(500).json({ error: "Unable to load recipes." });
  }
});

export default router;
