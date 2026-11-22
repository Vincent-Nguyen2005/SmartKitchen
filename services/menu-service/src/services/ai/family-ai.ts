import { createHash } from "node:crypto";
import { normalizeName } from "../kho-suggest";
import { conditionWarnings, familyAllergic, familyMealTarget, type FamilyHealth } from "../family-health";
import type { AiDish } from "./gemini";

/**
 * Family rules for AI dishes (pure functions).
 *
 * - familyBrief: what the model may see about the family. Anonymous aggregates only: the number of people eating,
 *   the union of the members' allergies ("must not contain"), the union of their conditions ("avoid if possible")
 *   and the family's kcal target per meal (sum of the members' 25 / 40 / 35 % shares). Never names or user ids.
 * - forFamily: the same rules as menu generation on the model's answer: a dish containing any member's allergen
 *   (tags or ingredient names) is dropped; a dish unsuitable for a member carries warnings naming that member
 *   (added locally, after the model call; visible to the whole family).
 * - contextHash: part of the AI cache key, so a change in allergies, conditions or targets regenerates the dishes.
 */
export type AiFamilyBrief = {
  people: number;
  mustNotContain: string[];
  avoidIfPossible: string[];
  mealTargets: { sang: number; trua: number; toi: number };
};

/** Distinct by accent-insensitive name, first spelling kept, sorted (stable prompt and hash). */
function union(lists: string[][]): string[] {
  const byKey = new Map<string, string>();
  for (const value of lists.flat()) {
    const key = normalizeName(value);
    if (key && !byKey.has(key)) byKey.set(key, value.trim());
  }
  return [...byKey.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value);
}

export function familyBrief(health: FamilyHealth): AiFamilyBrief {
  return {
    people: Math.max(1, health.members.length),
    mustNotContain: union(health.members.map((member) => member.allergies)),
    avoidIfPossible: union(health.members.map((member) => member.conditions)),
    mealTargets: {
      sang: Math.round(familyMealTarget(health, "BREAKFAST")),
      trua: Math.round(familyMealTarget(health, "LUNCH")),
      toi: Math.round(familyMealTarget(health, "DINNER")),
    },
  };
}

/** Hash of what changes the dishes: members' allergies, conditions and targets (not names). */
export function contextHash(health: FamilyHealth): string {
  const members = health.members
    .map((member) => [
      member.userId,
      union([member.allergies]).map(normalizeName),
      union([member.conditions]).map(normalizeName),
      [member.mealTargets.breakfast, member.mealTargets.lunch, member.mealTargets.dinner].map((value) => Math.round(value)),
    ])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  return createHash("sha256").update(JSON.stringify(members)).digest("hex");
}

const healthView = (dish: AiDish) => ({ ingredients: dish.ingredients, allergens: dish.allergens ?? [], contraindications: dish.contraindications ?? [] });

/** Drops dishes any member is allergic to and (re)computes the condition warnings for the current family. */
export function forFamily(dishes: AiDish[], health: FamilyHealth | undefined): AiDish[] {
  if (!health || health.members.length === 0) return dishes;
  return dishes
    .filter((dish) => !familyAllergic(healthView(dish), health))
    .map((dish) => {
      const warnings = conditionWarnings(healthView(dish), health);
      const { warnings: _old, ...rest } = dish;
      return warnings.length > 0 ? { ...rest, warnings } : rest;
    });
}
