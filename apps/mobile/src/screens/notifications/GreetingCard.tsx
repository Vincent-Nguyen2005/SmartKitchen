import React, { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, CloudSun, Moon, Sun } from "lucide-react-native";
import { AppIcon, colors, radius, spacing, textStyles, type LucideIcon } from "../../theme";
import { useSession } from "../../services/session";
import { useGatewayApi } from "./useGatewayApi";
import { greetingSlot, mealDishes, mealLine, msUntilNextBoundary, vnNow, type GreetingIcon, type GreetingMeal, type GreetingMenu } from "./greeting";

const ICONS: Record<GreetingIcon, LucideIcon> = { sun: Sun, "cloud-sun": CloudSun, moon: Moon };

type Props = {
  /** Tap with a menu line: open Lịch on today's meal. */
  onOpenMeal?: (meal: GreetingMeal) => void;
};

/**
 * Greeting card at the top of Thông báo (07:00–09:59, 10:00–13:59, 17:00–21:59 Vietnam time; nothing otherwise) with
 * today's dishes of that meal from the family menu (one GET /api/menu for today). In-app only: nothing stored, not a
 * notification, not in the bell badge. Re-checks when the tab is shown (mount), when the app comes back to the
 * foreground and at the next time boundary while open.
 */
export default function GreetingCard({ onOpenMeal }: Props): React.JSX.Element | null {
  const { api, userId } = useGatewayApi();
  const familyId = useSession().family?.id ?? null;
  const [now, setNow] = useState(() => new Date());
  const [menus, setMenus] = useState<{ day: string; items: GreetingMenu[] } | null>(null);
  const slot = greetingSlot(now);
  const { day, weekday } = vnNow(now);

  // Next boundary while open; back in the foreground: re-read the clock.
  useEffect(() => {
    const timer = setTimeout(() => setNow(new Date()), msUntilNextBoundary(now) + 1000);
    return () => clearTimeout(timer);
  }, [now]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") setNow(new Date()); });
    return () => subscription.remove();
  }, []);

  const loadMenus = useCallback(async (forDay: string) => {
    try {
      const result = await api.get<GreetingMenu[] | { items: GreetingMenu[] }>(`/api/menu?from=${forDay}&to=${forDay}`);
      setMenus({ day: forDay, items: Array.isArray(result) ? result : result.items ?? [] });
    } catch {
      setMenus({ day: forDay, items: [] }); // greeting only
    }
  }, [api]);
  const hasSlot = slot !== null;
  useEffect(() => {
    if (!userId || !familyId || !hasSlot) return;
    void loadMenus(day);
  }, [userId, familyId, hasSlot, day, loadMenus]);

  if (!slot) return null;
  const dishes = familyId && menus?.day === day ? mealDishes(menus.items, day, weekday, slot.meal) : [];
  const line = mealLine(slot.meal, dishes);
  const content = (
    <>
      <View style={local.icon}><AppIcon icon={ICONS[slot.icon]} color={colors.primary} /></View>
      <View style={local.text}>
        <Text style={local.greeting}>{slot.text}</Text>
        {line ? <Text style={local.meal} numberOfLines={2}>{line}</Text> : null}
      </View>
      {line && onOpenMeal ? <AppIcon icon={ChevronRight} size="sm" color={colors.muted} /> : null}
    </>
  );
  if (!line || !onOpenMeal) return <View style={local.card} accessibilityRole="summary">{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${slot.text} ${line}. Mở Lịch`} onPress={() => onOpenMeal(slot.meal)} style={local.card}>
      {content}
    </Pressable>
  );
}

const local = StyleSheet.create({
  card: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, flexDirection: "row", gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md },
  icon: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 999, height: 40, justifyContent: "center", width: 40 },
  text: { flex: 1, gap: 2 },
  greeting: { ...textStyles.label, color: colors.text },
  meal: { ...textStyles.bodySmall, color: colors.muted },
});
