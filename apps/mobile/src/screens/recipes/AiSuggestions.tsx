import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Bookmark, ShoppingCart, Sparkles } from "lucide-react-native";
import { AppIcon, colors, radius, spacing, textStyles, touchTarget } from "../../theme";
import { useSession } from "../../services/session";
import { createGatewayClient, errorMessage } from "../notifications/gatewayApi";
import { CardCaption, ImagePlaceholder, ProductCard, useCardGrid } from "../../components/ProductCard";
import { addMissingToCart } from "../shopping-cart/addMissing";
import CookingMode from "./CookingMode";
import RecipeDetail from "./RecipeDetail";
import type { Recipe } from "./recipeTypes";

type AiIngredient = { name: string; quantity: number | null; unit: string | null; fromKho: boolean };
type AiDish = {
  id: string;
  name: string;
  description: string;
  servings: number;
  totalMinutes: number;
  ingredients: AiIngredient[];
  steps: Array<{ order: number; instruction: string; durationSeconds: number | null; ingredients: string[] }>;
};
type AiStatus = "ready" | "generating" | "not_configured" | "empty_kho" | "error";
type AiResponse = { status: AiStatus; dishes: AiDish[]; limitReached?: boolean };
type SavedRecipe = { id: string; name: string; dish: AiDish };

const DISCLAIMER = "Công thức do AI gợi ý, hãy kiểm tra độ chín trước khi ăn.";
const POLL_MS = 10_000;
const POLL_FOR_MS = 120_000;

/** An AI dish in the shape the cooking mode and recipe detail use (step ingredients get the dish quantities). */
function toRecipe(dish: AiDish): Recipe {
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
 * Loads GET /api/menus/ai-suggestions on mount (the tab mounts on focus, so a Kho change made in the app is
 * picked up when the user comes back). While the server is generating it polls every 10 s, for at most 2 minutes.
 */
function useAiSuggestions(accessToken: string | null, familyId: string | null) {
  const [data, setData] = useState<AiResponse | null>(null);
  const pollStarted = useRef<number | null>(null);
  const api = createGatewayClient(accessToken);

  const load = useCallback(async () => {
    if (!accessToken || !familyId) return;
    try {
      setData(await api.get<AiResponse>(`/api/menus/ai-suggestions?familyId=${encodeURIComponent(familyId)}`));
    } catch {
      // The section is optional: a failed request just keeps what is shown.
    }
  }, [accessToken, familyId]);

  useEffect(() => {
    pollStarted.current = null;
    void load();
  }, [load]);

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

  return data;
}

type Props = { /** Nấu ăn also lists the dishes the family saved. */ showSaved?: boolean };

/** "Món gợi ý từ Kho": AI dishes made from the family's Kho. Hidden when AI is off or Kho is empty. */
export default function AiSuggestionsSection({ showSaved = false }: Props): React.JSX.Element | null {
  const { accessToken, family } = useSession();
  const familyId = family?.id ?? null;
  const data = useAiSuggestions(accessToken, familyId);
  const grid = useCardGrid();
  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [open, setOpen] = useState<{ dish: AiDish; saved: boolean } | null>(null);
  const [cooking, setCooking] = useState<Recipe | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "cart" | null>(null);
  const api = createGatewayClient(accessToken);

  const loadSaved = useCallback(async () => {
    if (!showSaved || !accessToken || !familyId) return;
    try {
      setSaved(await api.get<SavedRecipe[]>(`/api/menus/ai-recipes?familyId=${encodeURIComponent(familyId)}`));
    } catch {
      setSaved([]);
    }
  }, [showSaved, accessToken, familyId]);

  useEffect(() => { void loadSaved(); }, [loadSaved]);

  const openDish = (dish: AiDish, isSaved: boolean) => { setMessage(null); setOpen({ dish, saved: isSaved }); };

  const saveDish = async (dish: AiDish) => {
    if (!accessToken || !familyId || busy) return;
    setBusy("save");
    try {
      await api.post(`/api/menus/ai-suggestions/${encodeURIComponent(dish.id)}/save`, { familyId });
      setMessage("Đã lưu món. Bạn có thể nấu lại trong tab Nấu ăn.");
      void loadSaved();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const addMissing = async (dish: AiDish) => {
    const missing = dish.ingredients.filter((ingredient) => !ingredient.fromKho);
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

  const status = data?.status;
  const dishes = data?.dishes ?? [];
  const showSuggestions = !!familyId && !!data && status !== "not_configured" && status !== "empty_kho";
  if (!showSuggestions && saved.length === 0) return null;

  const card = (dish: AiDish, isSaved: boolean) => {
    const fromKho = dish.ingredients.filter((ingredient) => ingredient.fromKho).length;
    const missing = dish.ingredients.filter((ingredient) => !ingredient.fromKho);
    return (
      <ProductCard
        key={`${isSaved ? "saved" : "ai"}-${dish.id}`}
        width={grid.cardWidth}
        accessibilityLabel={`${dish.name}, ${dish.totalMinutes} phút, ${dish.servings} phần, dùng ${fromKho} nguyên liệu trong Kho${missing.length ? `, thiếu ${missing.map((entry) => entry.name).join(", ")}` : ""}`}
        onPress={() => openDish(dish, isSaved)}
        image={<ImagePlaceholder />}
        name={dish.name}
        subtitle={`${dish.totalMinutes} phút · ${dish.servings} phần`}
        footer={(
          <View>
            <CardCaption text={`Dùng ${fromKho} nguyên liệu trong Kho`} />
            {missing.length > 0 && <CardCaption warning text={`Thiếu: ${missing.map((entry) => entry.name.toLocaleLowerCase("vi")).join(", ")}`} />}
          </View>
        )}
      />
    );
  };

  const openMissing = open ? open.dish.ingredients.filter((ingredient) => !ingredient.fromKho).length : 0;
  return (
    <View style={local.section}>
      {showSuggestions && (
        <>
          <View style={local.heading}>
            <AppIcon icon={Sparkles} size="sm" color={colors.primary} />
            <Text style={local.title}>Món gợi ý từ Kho</Text>
            {status === "generating" && <ActivityIndicator color={colors.primary} />}
          </View>
          <Text style={local.disclaimer}>{DISCLAIMER}</Text>
          {status === "generating" && <Text style={local.muted}>Đang chuẩn bị gợi ý...</Text>}
          {status === "error" && dishes.length === 0 && <Text style={local.muted}>Chưa tạo được gợi ý. Sẽ thử lại khi Kho thay đổi.</Text>}
          {data?.limitReached && <Text style={local.muted}>Đã đủ lượt gợi ý hôm nay, đây là gợi ý gần nhất.</Text>}
          {dishes.length > 0 && (
            <View onLayout={grid.onLayout} style={[local.grid, { gap: grid.gap }]}>{dishes.map((dish) => card(dish, false))}</View>
          )}
        </>
      )}
      {showSaved && saved.length > 0 && (
        <>
          <Text style={local.title}>Món AI đã lưu</Text>
          <View onLayout={grid.onLayout} style={[local.grid, { gap: grid.gap }]}>{saved.map((entry) => card({ ...entry.dish, id: entry.id }, true))}</View>
        </>
      )}

      <RecipeDetail
        recipe={open ? toRecipe(open.dish) : null}
        onClose={() => setOpen(null)}
        onStartCooking={(recipe) => { setOpen(null); setCooking(recipe); }}
        startLabel="Nấu món này"
        notice={DISCLAIMER}
        message={message}
        actions={open && (
          <View style={local.actions}>
            {!open.saved && (
              <ActionButton icon={Bookmark} label="Lưu món" busy={busy === "save"} disabled={busy !== null} onPress={() => void saveDish(open.dish)} />
            )}
            {openMissing > 0 && (
              <ActionButton icon={ShoppingCart} label="Thêm phần thiếu vào giỏ hàng" busy={busy === "cart"} disabled={busy !== null} onPress={() => void addMissing(open.dish)} />
            )}
          </View>
        )}
      />
      <CookingMode recipe={cooking} onClose={() => setCooking(null)} />
    </View>
  );
}

function ActionButton({ icon, label, onPress, busy, disabled }: { icon: typeof Sparkles; label: string; onPress: () => void; busy: boolean; disabled: boolean }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy, disabled }} disabled={disabled} onPress={onPress} style={[local.action, disabled && local.disabled]}>
      {busy ? <ActivityIndicator color={colors.primary} /> : <AppIcon icon={icon} size="sm" color={colors.primary} />}
      <Text style={local.actionText}>{label}</Text>
    </Pressable>
  );
}

const local = StyleSheet.create({
  section: { gap: spacing.sm },
  heading: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  title: { ...textStyles.subheading, flexShrink: 1 },
  disclaimer: { ...textStyles.caption, color: colors.warning },
  muted: { ...textStyles.bodySmall, color: colors.muted },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", flexGrow: 1, gap: spacing.xs, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md },
  actionText: { ...textStyles.labelSmall, color: colors.primary },
  disabled: { opacity: 0.55 },
});
