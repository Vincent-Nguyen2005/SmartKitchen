/**
 * Where a tapped push opens (pure, covered by pushTarget.test.ts). The 07:00 "Chào buổi sáng" push carries
 * { type: "morning", screen: "menu", meal: "BREAKFAST", day } with a breakfast, else { type: "morning", screen: "home" }.
 */
export type GreetingMeal = "BREAKFAST" | "LUNCH" | "DINNER";

/** The morning push with a meal → Lịch on today's meal; without a menu → the app home (null); anything else → undefined. */
export const pushTarget = (data: unknown): { meal: GreetingMeal | null } | undefined => {
  const value = data as { type?: unknown; screen?: unknown; meal?: unknown } | null | undefined;
  if (value?.type !== "morning") return undefined;
  return value.screen === "menu" && (value.meal === "BREAKFAST" || value.meal === "LUNCH" || value.meal === "DINNER") ? { meal: value.meal } : { meal: null };
};
