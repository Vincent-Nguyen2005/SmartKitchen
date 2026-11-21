import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Bookmark, ShoppingCart } from "lucide-react-native";
import { AppIcon, colors, radius, spacing, textStyles, touchTarget, type LucideIcon } from "../../theme";
import { useSession } from "../../services/session";
import { createGatewayClient, errorMessage } from "../notifications/gatewayApi";
import { addMissingToCart } from "../shopping-cart/addMissing";
import RecipeDetail from "./RecipeDetail";
import type { Recipe } from "./recipeTypes";

export type AiMealType = "sang" | "trua" | "toi";
type AiIngredient = { name: string; quantity: number | null; unit: string | null; fromKho: boolean };
export type AiDish = {
  id: string;
  name: string;
  description: string;
  /** sáng / trưa / tối; null or missing = "Món khác". */
  mealType?: AiMealType | null;
  servings: number;
  totalMinutes: number;
  ingredients: AiIngredient[];
  steps: Array<{ order: number; instruction: string; durationSeconds: number | null; ingredients: string[] }>;
};
type AiStatus = "ready" | "generating" | "not_configured" | "empty_kho" | "error";
type AiResponse = { status: AiStatus; dishes: AiDish[]; limitReached?: boolean };
type SavedRecipe = { id: string; name: string; dish: AiDish };

export const AI_DISCLAIMER = "Công thức do AI gợi ý, hãy kiểm tra độ chín trước khi ăn.";
const POLL_MS = 10_000;
const POLL_FOR_MS = 120_000;

/** An AI dish in the shape the cooking mode and recipe detail use (step ingredients get the dish quantities). */
export function aiDishToRecipe(dish: AiDish): Recipe {
  const details = dish.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit }));
  return {
    id: dish.id,
    name: dish.name,
    description: dish.description,
    ingredients: details.map((detail) => detail.name),
    ingredientDetails: details,
    mealTypes: [],
    dietaryTags: [],
    servings: dish.servings,
    preparationMinutes: dish.totalMinutes,
    imageUrl: null,
    steps: dish.steps.map((step) => ({
      order: step.order,
      instruction: step.instruction,
      durationSeconds: step.durationSeconds,
      ingredients: step.ingredients.map((name) => details.find((detail) => detail.name === name) ?? { name, quantity: null, unit: null }),
    })),
  };
}

/**
 * AI dishes for the family: suggestions (GET /api/menus/ai-suggestions, loaded when the tab opens, polled every
 * 10 s for at most 2 minutes while the server is generating) and the dishes the family saved.
 * Suggestions are empty when AI is off (not_configured) or Kho is empty.
 */
export function useAiDishes() {
  const { accessToken, family } = useSession();
  const familyId = family?.id ?? null;
  const [data, setData] = useState<AiResponse | null>(null);
  const [saved, setSaved] = useState<AiDish[]>([]);
  const pollStarted = useRef<number | null>(null);
  const api = createGatewayClient(accessToken);

  const load = useCallback(async () => {
    if (!accessToken || !familyId) return;
    try {
      setData(await api.get<AiResponse>(`/api/menus/ai-suggestions?familyId=${encodeURIComponent(familyId)}`));
    } catch {
      // Optional feature: a failed request keeps what is shown.
    }
  }, [accessToken, familyId]);

  const loadSaved = useCallback(async () => {
    if (!accessToken || !familyId) return;
    try {
      const rows = await api.get<SavedRecipe[]>(`/api/menus/ai-recipes?familyId=${encodeURIComponent(familyId)}`);
      setSaved(rows.map((row) => ({ ...row.dish, id: `saved-${row.id}` })));
    } catch {
      setSaved([]);
    }
  }, [accessToken, familyId]);

  useEffect(() => {
    pollStarted.current = null;
    void load();
    void loadSaved();
  }, [load, loadSaved]);

  useEffect(() => {
    if (data?.status !== "generating") {
      pollStarted.current = null;
      return undefined;
    }
    pollStarted.current ??= Date.now();
    if (Date.now() - pollStarted.current >= POLL_FOR_MS) return undefined;
    const timer = setTimeout(() => void load(), POLL_MS);
    return () => clearTimeout(timer);
  }, [data, load]);

  const hidden = !data || data.status === "not_configured" || data.status === "empty_kho";
  return {
    suggestions: hidden ? [] : data.dishes,
    saved,
    generating: data?.status === "generating",
    limitReached: !!data?.limitReached,
    reloadSaved: loadSaved,
  };
}

type DetailProps = {
  dish: AiDish | null;
  /** Saved dishes have no "Lưu món". */
  isSaved: boolean;
  onClose: () => void;
  onStartCooking: (recipe: Recipe) => void;
  onSaved: () => void;
};

/** AI dish detail: the shared recipe detail with the disclaimer, "Nấu món này", "Lưu món" and "Thêm phần thiếu vào giỏ hàng". */
export function AiDishDetail({ dish, isSaved, onClose, onStartCooking, onSaved }: DetailProps): React.JSX.Element {
  const { accessToken, family } = useSession();
  const familyId = family?.id ?? null;
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "cart" | null>(null);
  const api = createGatewayClient(accessToken);

  useEffect(() => { setMessage(null); }, [dish?.id]);

  const save = async (target: AiDish) => {
    if (!accessToken || !familyId || busy) return;
    setBusy("save");
    try {
      await api.post(`/api/menus/ai-suggestions/${encodeURIComponent(target.id)}/save`, { familyId });
      setMessage("Đã lưu món. Món sẽ hiện trong Nấu ăn kể cả khi Kho thay đổi.");
      onSaved();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const addMissing = async (target: AiDish) => {
    const missing = target.ingredients.filter((ingredient) => !ingredient.fromKho);
    if (!accessToken || !familyId || busy || missing.length === 0) return;
    setBusy("cart");
    let added = 0;
    for (const ingredient of missing) {
      try {
        await addMissingToCart(accessToken, familyId, ingredient);
        added += 1;
      } catch {
        // Keep going; the message says how many were added.
      }
    }
    setBusy(null);
    setMessage(added === missing.length ? `Đã thêm ${added} nguyên liệu vào giỏ hàng` : `Đã thêm ${added}/${missing.length} nguyên liệu. Hãy thử lại phần còn lại.`);
  };

  const missingCount = dish ? dish.ingredients.filter((ingredient) => !ingredient.fromKho).length : 0;
  return (
    <RecipeDetail
      recipe={dish ? aiDishToRecipe(dish) : null}
      onClose={onClose}
      onStartCooking={onStartCooking}
      startLabel="Nấu món này"
      notice={AI_DISCLAIMER}
      message={message}
      actions={dish && (
        <View style={local.actions}>
          {!isSaved && <ActionButton icon={Bookmark} label="Lưu món" busy={busy === "save"} disabled={busy !== null} onPress={() => void save(dish)} />}
          {missingCount > 0 && (
            <ActionButton icon={ShoppingCart} label="Thêm phần thiếu vào giỏ hàng" busy={busy === "cart"} disabled={busy !== null} onPress={() => void addMissing(dish)} />
          )}
        </View>
      )}
    />
  );
}

function ActionButton({ icon, label, onPress, busy, disabled }: { icon: LucideIcon; label: string; onPress: () => void; busy: boolean; disabled: boolean }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy, disabled }} disabled={disabled} onPress={onPress} style={[local.action, disabled && local.disabled]}>
      {busy ? <ActivityIndicator color={colors.primary} /> : <AppIcon icon={icon} size="sm" color={colors.primary} />}
      <Text style={local.actionText}>{label}</Text>
    </Pressable>
  );
}

const local = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", flexGrow: 1, gap: spacing.xs, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md },
  actionText: { ...textStyles.labelSmall, color: colors.primary },
  disabled: { opacity: 0.55 },
});
