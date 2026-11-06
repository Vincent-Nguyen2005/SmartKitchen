<<<<<<< HEAD
import { ActivityLevel, Gender, PrismaClient, Prisma } from ".prisma/client-nutrition";
=======
import {
  ActivityLevel,
  Gender,
  MealSource,
  MealType,
  PrismaClient,
  Prisma,
} from "../../node_modules/.prisma/client-nutrition";
>>>>>>> origin/merge-team-main
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { calculateDailyCalories } from "../utils/nutrition-calculator";
import { getUserId } from "../utils/auth";

const router = Router();
const prisma = new PrismaClient();

const profileSchema = z.object({
  height: z.number().finite().positive().max(300),
  weight: z.number().finite().positive().max(700),
  age: z.number().int().positive().max(130),
  gender: z.nativeEnum(Gender),
  activityLevel: z.nativeEnum(ActivityLevel),
});

function parseProfile(request: Request, response: Response) {
  const result = profileSchema.safeParse(request.body);
  if (!result.success) {
    response.status(400).json({
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

const healthSelectionSchema = z
  .object({
    allergyIds: z.array(z.string().uuid()),
    conditionIds: z.array(z.string().uuid()),
  })
  .superRefine((selection, context) => {
    for (const [field, ids] of Object.entries(selection)) {
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "IDs must not contain duplicates.",
        });
      }
    }
  });

async function getUserHealth(userId: string) {
  const [userAllergies, userConditions] = await Promise.all([
    prisma.userAllergy.findMany({
      where: { userId },
      include: { allergy: true },
      orderBy: { allergy: { name: "asc" } },
    }),
    prisma.userHealthCondition.findMany({
      where: { userId },
      include: { condition: true },
      orderBy: { condition: { name: "asc" } },
    }),
  ]);

  return {
    allergies: userAllergies.map(({ allergy }) => allergy),
    healthConditions: userConditions.map(({ condition }) => condition),
  };
}

router.get("/allergies", async (_request, response) => {
  try {
    const allergies = await prisma.allergy.findMany({
      orderBy: { name: "asc" },
    });
    response.json(allergies);
  } catch {
    response.status(500).json({ error: "Unable to load allergies." });
  }
});

router.get("/health-conditions", async (_request, response) => {
  try {
    const conditions = await prisma.healthCondition.findMany({
      orderBy: { name: "asc" },
    });
    response.json(conditions);
  } catch {
    response.status(500).json({ error: "Unable to load health conditions." });
  }
});

router.get("/user/profile/health", async (request, response) => {
  const userId = getUserId(request, response);
  if (!userId) return;

  try {
    response.json(await getUserHealth(userId));
  } catch {
    response.status(500).json({ error: "Unable to load health selections." });
  }
});

router.post("/user/profile/health", async (request, response) => {
  const userId = getUserId(request, response);
  if (!userId) return;

  const result = healthSelectionSchema.safeParse(request.body);
  if (!result.success) {
    response.status(400).json({
      error: "Invalid health selections.",
      details: result.error.flatten(),
    });
    return;
  }

  const { allergyIds, conditionIds } = result.data;
  try {
    const [allergies, conditions] = await Promise.all([
      prisma.allergy.findMany({
        where: { id: { in: allergyIds } },
        select: { id: true },
      }),
      prisma.healthCondition.findMany({
        where: { id: { in: conditionIds } },
        select: { id: true },
      }),
    ]);

    if (
      allergies.length !== allergyIds.length ||
      conditions.length !== conditionIds.length
    ) {
      response
        .status(400)
        .json({ error: "One or more selected IDs do not exist." });
      return;
    }

    await prisma.$transaction(async (transaction) => {
      await Promise.all([
        transaction.userAllergy.deleteMany({ where: { userId } }),
        transaction.userHealthCondition.deleteMany({ where: { userId } }),
      ]);
      if (allergyIds.length > 0) {
        await transaction.userAllergy.createMany({
          data: allergyIds.map((allergyId) => ({ userId, allergyId })),
        });
      }
      if (conditionIds.length > 0) {
        await transaction.userHealthCondition.createMany({
          data: conditionIds.map((conditionId) => ({ userId, conditionId })),
        });
      }
    });

    response.json(await getUserHealth(userId));
  } catch {
    response.status(500).json({ error: "Unable to save health selections." });
  }
});

const mealItemSchema = z.object({
  foodName: z.string().trim().min(1).max(200),
  calories: z.number().finite().nonnegative(),
  protein: z.number().finite().nonnegative().nullable().optional(),
  carbs: z.number().finite().nonnegative().nullable().optional(),
  fat: z.number().finite().nonnegative().nullable().optional(),
  quantity: z.number().int().positive().max(10000).default(1),
});

const mealLogSchema = z.object({
  mealType: z.nativeEnum(MealType),
  source: z.nativeEnum(MealSource),
  loggedAt: z.string().datetime({ offset: true }).optional(),
  items: z.array(mealItemSchema).min(1).max(100),
});

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "Use a real date in YYYY-MM-DD format.");

const mealHistoryQuerySchema = z
  .object({
    date: calendarDateSchema.optional(),
    startDate: calendarDateSchema.optional(),
    endDate: calendarDateSchema.optional(),
  })
  .superRefine((query, context) => {
    if (query.date && (query.startDate || query.endDate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["date"],
        message: "Use either date or a startDate/endDate range.",
      });
    } else if (!query.date && (!query.startDate || !query.endDate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startDate"],
        message: "Provide date or both startDate and endDate.",
      });
    } else if (
      query.startDate &&
      query.endDate &&
      query.startDate > query.endDate
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "endDate must be on or after startDate.",
      });
    }
  });

function utcStartOfDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

router.post("/meals/log", async (request, response) => {
  const userId = getUserId(request, response);
  if (!userId) return;

  const result = mealLogSchema.safeParse(request.body);
  if (!result.success) {
    response.status(400).json({
      error: "Invalid meal log.",
      details: result.error.flatten(),
    });
    return;
  }

  const { items, loggedAt, ...mealData } = result.data;
  try {
    const mealLog = await prisma.$transaction((transaction) =>
      transaction.mealLog.create({
        data: {
          ...mealData,
          userId,
          ...(loggedAt ? { loggedAt: new Date(loggedAt) } : {}),
          items: { create: items },
        },
        include: { items: true },
      }),
    );
    response.status(201).json(mealLog);
  } catch {
    response.status(500).json({ error: "Unable to save meal log." });
  }
});

router.get("/meals/history", async (request, response) => {
  const userId = getUserId(request, response);
  if (!userId) return;

  const result = mealHistoryQuerySchema.safeParse(request.query);
  if (!result.success) {
    response.status(400).json({
      error: "Invalid meal history date range.",
      details: result.error.flatten(),
    });
    return;
  }

  const { date, startDate, endDate } = result.data;
  const from = utcStartOfDate(date ?? startDate!);
  const through = utcStartOfDate(date ?? endDate!);
  through.setUTCDate(through.getUTCDate() + 1);

  try {
    const meals = await prisma.mealLog.findMany({
      where: { userId, loggedAt: { gte: from, lt: through } },
      include: { items: true },
      orderBy: { loggedAt: "desc" },
    });

    const summaries = new Map<
      string,
      {
        date: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
      }
    >();
    for (const meal of meals) {
      const day = meal.loggedAt.toISOString().slice(0, 10);
      const summary = summaries.get(day) ?? {
        date: day,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      };
      for (const item of meal.items) {
        summary.calories += item.calories * item.quantity;
        summary.protein += (item.protein ?? 0) * item.quantity;
        summary.carbs += (item.carbs ?? 0) * item.quantity;
        summary.fat += (item.fat ?? 0) * item.quantity;
      }
      summaries.set(day, summary);
    }
    if (date && !summaries.has(date)) {
      summaries.set(date, {
        date,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      });
    }

    response.json({
      meals,
      dailySummary: [...summaries.values()].sort((first, second) =>
        first.date.localeCompare(second.date),
      ),
    });
  } catch {
    response.status(500).json({ error: "Unable to load meal history." });
  }
});

router.delete("/meals/:id", async (request, response) => {
  const userId = getUserId(request, response);
  if (!userId) return;

  const idResult = z.string().uuid().safeParse(request.params.id);
  if (!idResult.success) {
    response.status(400).json({ error: "A valid meal log ID is required." });
    return;
  }

  try {
    const result = await prisma.mealLog.deleteMany({
      where: { id: idResult.data, userId },
    });
    if (result.count === 0) {
      response.status(404).json({ error: "Meal log not found." });
      return;
    }
    response.status(204).send();
  } catch {
    response.status(500).json({ error: "Unable to delete meal log." });
  }
});

export default router;
