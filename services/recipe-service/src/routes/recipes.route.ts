import { PrismaClient } from "@prisma/client";
import { Router, Request, Response } from "express";
import { ZodError } from "zod";
import { RecipeService } from "../services/recipe.service";
import { createRecipeSchema, recipeListQuerySchema, updateRecipeSchema } from "../services/recipe.validation";

const isPrismaError = (error: unknown, code: string): boolean =>
    typeof error === "object" && error !== null && "code" in error && error.code === code;

const sendError = (res: Response, error: unknown): void => {
    if (error instanceof ZodError) {
        res.status(400).json({ error: "Invalid recipe data", details: error.flatten().fieldErrors });
        return;
    }
    if (isPrismaError(error, "P2002")) {
        res.status(409).json({ error: "A recipe, category, or tag with that unique value already exists" });
        return;
    }
    if (isPrismaError(error, "P2025")) {
        res.status(404).json({ error: "Recipe not found" });
        return;
    }
    res.status(500).json({ error: "Unable to process recipe request" });
};

export const createRecipesRouter = (prisma: PrismaClient): Router => {
    const router = Router();
    const recipes = new RecipeService(prisma);

    router.get("/recipes", async (req: Request, res: Response): Promise<void> => {
        const parsed = recipeListQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            sendError(res, parsed.error);
            return;
        }
        try {
            res.json(await recipes.list(parsed.data));
        } catch (error) {
            sendError(res, error);
        }
    });

    router.get("/recipes/:id", async (req: Request<{ id: string }>, res: Response): Promise<void> => {
        if (!isUuid(req.params.id)) {
            res.status(400).json({ error: "Recipe id must be a UUID" });
            return;
        }
        try {
            const recipe = await recipes.getById(req.params.id);
            if (!recipe) {
                res.status(404).json({ error: "Recipe not found" });
                return;
            }
            res.json(recipe);
        } catch (error) {
            sendError(res, error);
        }
    });

    router.post("/recipes", async (req: Request, res: Response): Promise<void> => {
        const parsed = createRecipeSchema.safeParse(req.body);
        if (!parsed.success) {
            sendError(res, parsed.error);
            return;
        }
        try {
            res.status(201).json(await recipes.create(parsed.data));
        } catch (error) {
            sendError(res, error);
        }
    });

    router.put("/recipes/:id", async (req: Request<{ id: string }>, res: Response): Promise<void> => {
        if (!isUuid(req.params.id)) {
            res.status(400).json({ error: "Recipe id must be a UUID" });
            return;
        }
        const parsed = updateRecipeSchema.safeParse(req.body);
        if (!parsed.success) {
            sendError(res, parsed.error);
            return;
        }
        try {
            res.json(await recipes.update(req.params.id, parsed.data));
        } catch (error) {
            sendError(res, error);
        }
    });

    router.delete("/recipes/:id", async (req: Request<{ id: string }>, res: Response): Promise<void> => {
        if (!isUuid(req.params.id)) {
            res.status(400).json({ error: "Recipe id must be a UUID" });
            return;
        }
        try {
            await recipes.delete(req.params.id);
            res.status(204).send();
        } catch (error) {
            sendError(res, error);
        }
    });

    return router;
};

const isUuid = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export default createRecipesRouter;