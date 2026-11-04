import { ActivityLevel, Gender, PrismaClient, Prisma } from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { calculateDailyCalories } from "../utils/nutrition-calculator";

const router = Router();
const prisma = new PrismaClient();

const profileSchema = z.object({
  height: z.number().finite().positive().max(300),
  weight: z.number().finite().positive().max(700),
  age: z.number().int().positive().max(130),
  gender: z.nativeEnum(Gender),
  activityLevel: z.nativeEnum(ActivityLevel),
});

function getUserId(request: Request, response: Response): string | undefined {
  const userId = request.header("X-User-Id");
  if (!userId || !z.string().uuid().safeParse(userId).success) {
    response
      .status(401)
      .json({ error: "A valid authenticated user is required." });
    return undefined;
  }
  return userId;
}

function parseProfile(request: Request, response: Response) {
  const result = profileSchema.safeParse(request.body);
  if (!result.success) {
    response
      .status(400)
      .json({
        error: "Invalid nutrition profile.",
        details: result.error.flatten(),
      });
    return undefined;
  }
  return result.data;
}

function profileResponse(profile: Prisma.NutritionProfileGetPayload<object>) {
  const { bmr, tdee } = calculateDailyCalories(profile);
  return { profile, bmr: Math.round(bmr), tdee: Math.round(tdee) };
}

router.get("/", async (request, response) => {
  const userId = getUserId(request, response);
  if (!userId) return;

  try {
    const profile = await prisma.nutritionProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      response.status(404).json({ error: "Nutrition profile not found." });
      return;
    }
    response.json(profileResponse(profile));
  } catch {
    response.status(500).json({ error: "Unable to load nutrition profile." });
  }
});

router.post("/", async (request, response) => {
  const userId = getUserId(request, response);
  if (!userId) return;
  const data = parseProfile(request, response);
  if (!data) return;

  try {
    const profile = await prisma.nutritionProfile.create({
      data: { ...data, userId },
    });
    response.status(201).json(profileResponse(profile));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      response
        .status(409)
        .json({ error: "A nutrition profile already exists for this user." });
      return;
    }
    response.status(500).json({ error: "Unable to save nutrition profile." });
  }
});

router.put("/", async (request, response) => {
  const userId = getUserId(request, response);
  if (!userId) return;
  const data = parseProfile(request, response);
  if (!data) return;

  try {
    const profile = await prisma.nutritionProfile.upsert({
      where: { userId },
      create: { ...data, userId },
      update: data,
    });
    response.json(profileResponse(profile));
  } catch {
    response.status(500).json({ error: "Unable to update nutrition profile." });
  }
});

export default router;
