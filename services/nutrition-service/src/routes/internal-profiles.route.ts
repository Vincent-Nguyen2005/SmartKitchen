import { PrismaClient } from ".prisma/client-nutrition";
import { Router } from "express";
import { z } from "zod";
import { requireInternalKey } from "../middleware/internal-key";
import { ageFromBirthDate, dayOf } from "../utils/age";
import { dailyTargets, mealTargets, tdeeOf } from "../utils/targets";

const prisma = new PrismaClient();
const router = Router();
router.use(requireInternalKey);

const bodySchema = z.object({ userIds: z.array(z.string().uuid()).min(1).max(20) });

/**
 * POST /internal/profiles { userIds } (max 20): targets and health tags per user, for family menus. Users without a
 * profile get hasProfile=false and the default targets. No names or other personal details beyond what menus need.
 */
router.post("/", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_BODY", message: "userIds must be 1-20 UUIDs" });
    return;
  }
  const userIds = [...new Set(parsed.data.userIds)];
  try {
    const [profiles, allergies, conditions, customs] = await Promise.all([
      prisma.nutritionProfile.findMany({ where: { userId: { in: userIds } } }),
      prisma.userAllergy.findMany({ where: { userId: { in: userIds } }, select: { userId: true, allergy: { select: { name: true } } } }),
      prisma.userHealthCondition.findMany({ where: { userId: { in: userIds } }, select: { userId: true, condition: { select: { name: true } } } }),
      prisma.userHealthCustom.findMany({ where: { userId: { in: userIds } } }),
    ]);
    const byUser = <T extends { userId: string }>(rows: T[], userId: string) => rows.filter((row) => row.userId === userId);

    const items = userIds.map((userId) => {
      const stored = profiles.find((profile) => profile.userId === userId) ?? null;
      // A stored birth date gives the current age (targets follow birthdays).
      const profile = stored?.birthDate ? { ...stored, age: ageFromBirthDate(dayOf(stored.birthDate)) } : stored;
      const custom = customs.find((row) => row.userId === userId);
      const daily = dailyTargets(profile);
      return {
        userId,
        hasProfile: profile !== null,
        sex: profile?.gender ?? null,
        age: profile?.age ?? null,
        tdee: Math.round(tdeeOf(profile)),
        macros: { protein: daily.protein, carbs: daily.carbs, fat: daily.fat },
        mealTargets: mealTargets(profile),
        allergies: [...byUser(allergies, userId).map((row) => row.allergy.name), ...(custom?.allergies ?? [])],
        conditions: [...byUser(conditions, userId).map((row) => row.condition.name), ...(custom?.conditions ?? [])],
      };
    });
    res.json({ items });
  } catch (error) {
    console.error("[nutrition-service] internal profile lookup failed", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Unable to load profiles" });
  }
});

export default router;
