import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChefHat, ChevronRight, Clock, TriangleAlert, X } from "lucide-react-native";
import { AppIcon, colors, IconButton, radius, spacing, textStyles, touchTarget } from "../../theme";
import { RemoteImage } from "../notifications/ui";
import { amountText, durationText, minutesText, recipeIngredients, sortedSteps, totalMinutes, type Recipe } from "./recipeTypes";

type Props = {
  recipe: Recipe | null;
  onClose: () => void;
  /** Cook mode only. */
  onStartCooking?: (recipe: Recipe) => void;
  /** Shown above the ingredients (e.g. the AI disclaimer). */
  notice?: string;
  /** Result of an extra action ("Đã lưu món"). */
  message?: string | null;
  /** Extra buttons above the start button (AI dishes: "Lưu món", "Thêm phần thiếu vào giỏ hàng"). */
  actions?: React.ReactNode;
  startLabel?: string;
  /**
   * "cook" (Nấu ăn, default): ingredients, steps, the extra actions and the start button.
   * "view" (Lịch): image, name, time, servings, description and ingredients only.
   */
  mode?: "view" | "cook";
  /**
   * Family health notes of the planned dish: "Huy: không hợp tiểu đường" lines and one alternative dish (tapping it
   * opens that dish; in Nấu ăn it can then be cooked).
   */
  health?: { warnings: string[]; alternative?: { name: string; onPress: () => void } | null } | null;
};

/** Món ăn: image, ingredients with quantities, the steps with their times, total time and "Bắt đầu nấu". */
export default function RecipeDetail({ recipe, onClose, onStartCooking, notice, message, actions, startLabel = "Bắt đầu nấu", mode = "cook", health }: Props): React.JSX.Element {
  const cook = mode === "cook";
  const steps = recipe ? sortedSteps(recipe) : [];
  const total = recipe ? totalMinutes(recipe) : null;
  return (
    <Modal visible={recipe !== null} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={local.screen}>
        <View style={local.header}>
          <Text style={local.title} numberOfLines={2} accessibilityRole="header">{recipe?.name ?? ""}</Text>
          <IconButton icon={X} accessibilityLabel="Đóng" onPress={onClose} />
        </View>
        {recipe && (
          <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={local.body}>
            <View style={local.hero}>
              <RemoteImage uri={recipe.imageUrl ?? null} size={120} accessibilityLabel={recipe.name} />
              <View style={local.heroText}>
                <View style={local.metaRow}>
                  <AppIcon icon={Clock} size="sm" color={colors.primary} />
                  <Text style={local.meta}>{total !== null ? minutesText(total) : "Thời gian linh hoạt"}</Text>
                </View>
                {!!recipe.servings && <Text style={local.meta}>{recipe.servings} phần</Text>}
                {!!recipe.description && <Text style={local.description}>{recipe.description}</Text>}
              </View>
            </View>

            {!!notice && <Text style={local.notice}>{notice}</Text>}
            {health && health.warnings.length > 0 && (
              <View style={local.health} accessibilityRole="summary">
                <View style={local.healthTitleRow}>
                  <AppIcon icon={TriangleAlert} size="sm" color={colors.warning} />
                  <Text style={local.healthTitle}>Lưu ý sức khỏe</Text>
                </View>
                {health.warnings.map((line) => <Text key={line} style={local.healthLine}>{line}</Text>)}
                {health.alternative && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Món thay thế: ${health.alternative.name}. Xem món`}
                    onPress={health.alternative.onPress}
                    style={({ pressed }) => [local.alternative, pressed && local.pressed]}
                  >
                    <View style={local.alternativeText}>
                      <Text style={local.alternativeLabel}>Món thay thế</Text>
                      <Text style={local.alternativeName}>{health.alternative.name}</Text>
                    </View>
                    <AppIcon icon={ChevronRight} size="sm" color={colors.primary} />
                  </Pressable>
                )}
              </View>
            )}
            <Text style={local.section}>Nguyên liệu</Text>
            <View style={local.card}>
              {recipeIngredients(recipe).filter((ingredient) => !ingredient.isSeasoning).map((ingredient) => (
                <View key={ingredient.name} style={local.ingredientRow}>
                  <Text style={local.ingredientName}>{ingredient.name}</Text>
                  {!!amountText(ingredient) && <Text style={local.ingredientQty}>{amountText(ingredient)}</Text>}
                </View>
              ))}
            </View>
            {recipeIngredients(recipe).some((ingredient) => ingredient.isSeasoning) && (
              <>
                <Text style={local.section}>Gia vị</Text>
                <View style={local.card}>
                  {recipeIngredients(recipe).filter((ingredient) => ingredient.isSeasoning).map((ingredient) => (
                    <View key={ingredient.name} style={local.ingredientRow}>
                      <Text style={local.ingredientName}>{ingredient.name}</Text>
                      {!!amountText(ingredient) && <Text style={local.ingredientQty}>{amountText(ingredient)}</Text>}
                    </View>
                  ))}
                </View>
              </>
            )}

            {cook && <Text style={local.section}>Các bước</Text>}
            {!cook ? null : steps.length === 0 ? (
              <Text style={local.muted}>Món này chưa có các bước nấu.</Text>
            ) : (
              <View style={local.card}>
                {steps.map((step, index) => (
                  <View key={`${step.order}-${index}`} style={local.stepRow}>
                    <View style={local.stepNumber}><Text style={local.stepNumberText}>{index + 1}</Text></View>
                    <View style={local.stepText}>
                      <Text style={local.stepInstruction}>{step.instruction}</Text>
                      <Text style={local.muted}>{step.durationSeconds ? durationText(step.durationSeconds) : "Không hẹn giờ"}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
        {recipe && cook && (
          <View style={local.footer}>
            {!!message && <Text style={local.message} accessibilityLiveRegion="polite">{message}</Text>}
            {actions}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: steps.length === 0 }} disabled={steps.length === 0} onPress={() => onStartCooking?.(recipe)} style={[local.startButton, steps.length === 0 && local.disabled]}>
              <AppIcon icon={ChefHat} size="md" color={colors.primaryText} />
              <Text style={local.startText}>{startLabel}</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const local = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  title: { ...textStyles.heading, flex: 1 },
  body: { alignSelf: "center", gap: spacing.md, maxWidth: 720, padding: spacing.lg, width: "100%" },
  hero: { flexDirection: "row", gap: spacing.md },
  heroText: { flex: 1, gap: spacing.xs },
  metaRow: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  meta: { ...textStyles.labelSmall, color: colors.primary },
  description: { ...textStyles.bodySmall, color: colors.muted },
  section: { ...textStyles.subheading },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  ingredientRow: { flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  ingredientName: { ...textStyles.body, flex: 1 },
  ingredientQty: { ...textStyles.body, color: colors.muted },
  stepRow: { flexDirection: "row", gap: spacing.sm },
  stepNumber: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.pill, height: 28, justifyContent: "center", width: 28 },
  stepNumberText: { ...textStyles.labelSmall, color: colors.primary },
  stepText: { flex: 1, gap: 2 },
  stepInstruction: { ...textStyles.body },
  muted: { ...textStyles.bodySmall, color: colors.muted },
  footer: { borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.sm, padding: spacing.md },
  notice: { ...textStyles.bodySmall, backgroundColor: colors.warningSoft, borderRadius: radius.sm, color: colors.warning, padding: spacing.sm },
  health: { backgroundColor: colors.warningSoft, borderRadius: radius.sm, gap: spacing.xs, padding: spacing.sm },
  healthTitleRow: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  healthTitle: { ...textStyles.labelSmall, color: colors.warning },
  healthLine: { ...textStyles.bodySmall, color: colors.text },
  alternative: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs, minHeight: touchTarget, paddingHorizontal: spacing.sm },
  alternativeText: { flex: 1 },
  alternativeLabel: { ...textStyles.caption, color: colors.muted },
  alternativeName: { ...textStyles.label, color: colors.primary },
  pressed: { opacity: 0.82 },
  message: { ...textStyles.bodySmall, color: colors.primary, textAlign: "center" },
  startButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: touchTarget + 8 },
  startText: { ...textStyles.label, color: colors.primaryText },
  disabled: { opacity: 0.5 },
});
