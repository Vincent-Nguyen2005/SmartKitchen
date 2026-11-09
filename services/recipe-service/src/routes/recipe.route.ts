import { Router } from "express";
import {
  createRecipeController,
  deleteRecipeController,
  getRecipeController,
  listRecipesController,
  updateRecipeController,
} from "../controllers/recipe.controller";
import { requireRecipeAdmin } from "../middleware/require-recipe-admin";

const router = Router();

router.get("/", listRecipesController);
router.post("/", requireRecipeAdmin, createRecipeController);
router.get("/:id", getRecipeController);
router.put("/:id", requireRecipeAdmin, updateRecipeController);
router.delete("/:id", requireRecipeAdmin, deleteRecipeController);

export default router;
