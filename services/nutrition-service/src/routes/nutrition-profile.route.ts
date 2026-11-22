import { ActivityLevel, Gender, MealSource, MealType, PrismaClient, Prisma } from ".prisma/client-nutrition";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { calculateDailyCalories } from "../utils/nutrition-calculator";
import { ageFromBirthDate, dayOf, vnToday } from "../utils/age";

const router = Router();
const prisma = new PrismaClient();

const MIN_BIRTH_DATE = "1900-01-01";

/**
 * birthDate (YYYY-MM-DD, preferred) or age (older clients). With birthDate the age is computed server-side in
 * Vietnam time and stored too, so readers of `age` keep working.
 */
const profileSchema = z.object({
  height: z.number().finite().positive().max(300),
  weight: z.number().finite().positive().max(700),
  age: z.number().int().positive().max(130).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((day) => !Number.isNaN(Date.parse(`${day}T00:00:00Z`)), "Invalid date").optional(),
  gender: z.nativeEnum(Gender),
  activityLevel: z.nativeEnum(ActivityLevel),
}).superRefine((input, context) => {
  if (input.birthDate === undefined && input.age === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["birthDate"], message: "birthDate or age is required." });
    return;
  }
  if (input.birthDate !== undefined) {
    const today = vnToday();
    const age = ageFromBirthDate(input.birthDate, today);
    if (input.birthDate < MIN_BIRTH_DATE || input.birthDate > today || age < 1 || age > 130) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["birthDate"], message: "birthDate must give an age between 1 and 130." });
    }
  }
}).transform(({ birthDate, age, ...rest }) => (birthDate !== undefined
  ? { ...rest, age: ageFromBirthDate(birthDate), birthDate: new Date(`${birthDate}T00:00:00.000Z`) }
  // Age only: the stored birth date (if any) is left as it is.
  : { ...rest, age: age as number }));

export const profileInputSchema = profileSchema;

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

/** With a stored birth date the age is always the current one (it changes every birthday). */
function profileResponse(stored: Prisma.NutritionProfileGetPayload<object>) {
  const profile = stored.birthDate ? { ...stored, age: ageFromBirthDate(dayOf(stored.birthDate)) } : stored;
  const { bmr, tdee } = calculateDailyCalories(profile);
  return { profile: { ...profile, birthDate: profile.birthDate ? dayOf(profile.birthDate) : null }, bmr: Math.round(bmr), tdee: Math.round(tdee) };
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

// ---- Restored from Hung's Sprint 3 work (reverted in PR #34): health declarations and meal logs.
const customTags = z.array(z.string().trim().min(1).max(80)).max(30).optional();
const healthSelectionSchema = z
  .object({
    allergyIds: z.array(z.string().uuid()),
    conditionIds: z.array(z.string().uuid()),
    /** Free text not in the catalogs: kept on the profile, ignored by the suggestion filter. */
    customAllergies: customTags,
    customConditions: customTags,
  })
  .superRefine((selection, context) => {
    for (const [field, ids] of Object.entries({ allergyIds: selection.allergyIds, conditionIds: selection.conditionIds })) {
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "IDs must not contain duplicates.",
        });
      }
    }
  });

const tagKey = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

/**
 * Splits typed names into catalog ids (a name equal to a catalog item, ignoring accents and case) and custom
 * names (the rest, deduplicated).
 */
export function splitCustom(names: string[] | undefined, catalog: Array<{ id: string; name: string }>): { ids: string[]; custom: string[] } {
  const ids: string[] = [];
  const custom: string[] = [];
  const seen = new Set<string>();
  for (const name of names ?? []) {
    const key = tagKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const match = catalog.find((item) => tagKey(item.name) === key);
    if (match) ids.push(match.id); else custom.push(name.trim());
  }
  return { ids, custom };
}

async function getUserHealth(userId: string) {
  const [userAllergies, userConditions, custom] = await Promise.all([
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
    prisma.userHealthCustom.findUnique({ where: { userId } }),
  ]);

  return {
    allergies: userAllergies.map(({ allergy }) => allergy),
    healthConditions: userConditions.map(({ condition }) => condition),
    customAllergies: custom?.allergies ?? [],
    customConditions: custom?.conditions ?? [],
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

  try {
    // Typed names that are catalog items become selections; the rest are stored as custom items.
    const [allergyCatalog, conditionCatalog] = result.data.customAllergies?.length || result.data.customConditions?.length
      ? await Promise.all([
        prisma.allergy.findMany({ select: { id: true, name: true } }),
        prisma.healthCondition.findMany({ select: { id: true, name: true } }),
      ])
      : [[], []];
    const customAllergies = splitCustom(result.data.customAllergies, allergyCatalog);
    const customConditions = splitCustom(result.data.customConditions, conditionCatalog);
    const allergyIds = [...new Set([...result.data.allergyIds, ...customAllergies.ids])];
    const conditionIds = [...new Set([...result.data.conditionIds, ...customConditions.ids])];
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
      if (result.data.customAllergies !== undefined || result.data.customConditions !== undefined) {
        const custom = { allergies: customAllergies.custom, conditions: customConditions.custom };
        await transaction.userHealthCustom.upsert({ where: { userId }, create: { userId, ...custom }, update: custom });
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
