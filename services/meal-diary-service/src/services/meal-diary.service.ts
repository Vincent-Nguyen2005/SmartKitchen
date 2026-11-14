import { PrismaClient } from ".prisma/client-meal-diary";
import type { MealLogInput } from "../dto/meal-diary.dto";

const prisma = new PrismaClient();

function startOfDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export async function createMealDiary(userId: string, input: MealLogInput) {
  const { date, loggedAt, items, ...data } = input;
  return prisma.mealDiary.create({
    data: {
      ...data,
      userId,
      date: startOfDate(date),
      ...(loggedAt ? { loggedAt: new Date(loggedAt) } : {}),
      items: { create: items },
    },
    include: { items: true },
  });
}

export async function getMealHistory(userId: string, date: string) {
  const meals = await prisma.mealDiary.findMany({
    where: { userId, date: startOfDate(date) },
    include: { items: true },
    orderBy: { loggedAt: "desc" },
  });

  const summary = meals.reduce(
    (totals, meal) => {
      for (const item of meal.items) {
        totals.calories += item.calories * item.quantity;
        totals.protein += (item.protein ?? 0) * item.quantity;
        totals.carbs += (item.carbs ?? 0) * item.quantity;
        totals.fat += (item.fat ?? 0) * item.quantity;
      }
      return totals;
    },
    { date, calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return { meals, dailySummary: [summary] };
}

export async function getDailyMealSummary(userId: string, date: string) {
  const history = await getMealHistory(userId, date);
  const summary = history.dailySummary[0];
  return {
    date: summary.date,
    totalCalories: summary.calories,
    totalProtein: summary.protein,
    totalCarbs: summary.carbs,
    totalFat: summary.fat,
  };
}

export async function deleteMealDiary(userId: string, id: string): Promise<boolean> {
  const result = await prisma.mealDiary.deleteMany({ where: { id, userId } });
  return result.count > 0;
}
