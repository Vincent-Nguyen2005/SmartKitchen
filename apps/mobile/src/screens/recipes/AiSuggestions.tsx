import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Bookmark, ShoppingCart } from "lucide-react-native";
import { AppIcon, colors, radius, spacing, textStyles, touchTarget, type LucideIcon } from "../../theme";
import { useSession } from "../../services/session";
import { createGatewayClient, errorMessage } from "../notifications/gatewayApi";
import { addMissingToCart } from "../shopping-cart/addMissing";
import { warningText, type HealthWarning } from "../menu/menuShared";
import RecipeDetail from "./RecipeDetail";
import { scaleQuantity, scaleRecipe } from "./portions";
import type { Recipe } from "./recipeTypes";

export type AiMealType = "sang" | "trua" | "toi";
type AiIngredient = { name: string; quantity: number | null; unit: string | null; fromKho: boolean; isSeasoning?: boolean; perPerson?: boolean };
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
  /** Per serving, from the model (logged as 1 portion when cooked). */
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  /** Members for whom the dish is unsuitable (menu-service family rules). */
  warnings?: HealthWarning[];
};

export const AI_DISCLAIMER = "Công thức do AI gợi ý, hãy kiểm tra độ chín trước khi ăn.";

/** An AI dish in the shape the cooking mode and recipe detail use (step ingredients get the dish quantities). */
export function aiDishToRecipe(dish: AiDish): Recipe {
  const details = dish.ingredients.map(({ name, quantity, unit, isSeasoning, perPerson }) => ({ name, quantity, unit, isSeasoning: isSeasoning ?? false, ...(perPerson ? { perPerson: true } : {}) }));
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
    // Per-serving macros from the model: cooking logs 1 portion with them.
    calories: dish.calories ?? null,
    protein: dish.protein ?? null,
    carbs: dish.carbs ?? null,
    fat: dish.fat ?? null,
    imageUrl: null,
    steps: dish.steps.map((step) => ({
      order: step.order,
      instruction: step.instruction,
      durationSeconds: step.durationSeconds,
      ingredients: step.ingredients.map((name) => details.find((detail) => detail.name === name) ?? { name, quantity: null, unit: null }),
    })),
  };
}

type DetailProps = {
  dish: AiDish | null;
  /** Saved dishes have no "Lưu món". */
  onClose: () => void;
  onStartCooking?: (recipe: Recipe) => void;
  /** "view" (Lịch): read-only detail; "cook" (Nấu ăn): steps, cooking and the AI actions. */
  mode?: "view" | "cook";
  /** People eating (menu servings / family size): quantities, cooking mode and the cart use their amounts. */
  people?: number;
};

/** AI dish detail: the shared recipe detail with the disclaimer, "Nấu món này", "Lưu món" and "Thêm phần thiếu vào giỏ hàng". */
export function AiDishDetail({ dish, onClose, onStartCooking, mode = "cook", people }: DetailProps): React.JSX.Element {
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
      setMessage("Đã lưu món cho gia đình.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const addMissing = async (target: AiDish) => {
    // Amounts for the people eating (same rule as the menu: portions.ts).
    const missing = target.ingredients.filter((ingredient) => !ingredient.fromKho && !ingredient.isSeasoning)
      .map((ingredient) => (people ? { ...ingredient, quantity: scaleQuantity(ingredient, target.servings, people) } : ingredient));
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

  const missingCount = dish ? dish.ingredients.filter((ingredient) => !ingredient.fromKho && !ingredient.isSeasoning).length : 0;
  return (
    <RecipeDetail
      recipe={dish ? (people ? scaleRecipe(aiDishToRecipe(dish), people) : aiDishToRecipe(dish)) : null}
      onClose={onClose}
      onStartCooking={onStartCooking}
      startLabel="Nấu món này"
      mode={mode}
      notice={AI_DISCLAIMER}
      health={dish?.warnings?.length ? { warnings: dish.warnings.map(warningText), alternative: null } : null}
      message={message}
      actions={dish && (
        <View style={local.actions}>
          <ActionButton icon={Bookmark} label="Lưu món" busy={busy === "save"} disabled={busy !== null} onPress={() => void save(dish)} />
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
