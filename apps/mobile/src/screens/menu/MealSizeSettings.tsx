import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { AppIcon, colors, radius, spacing, textStyles, touchTarget } from "../../theme";
import { useSession } from "../../services/session";
import { createGatewayClient, errorMessage } from "../notifications/gatewayApi";

type Counts = { breakfast: number; lunch: number; dinner: number };
/** canEdit: false for family members who are not the OWNER (the setting is the family's). */
type Settings = Counts & { canEdit?: boolean };
const MEALS: Array<{ key: keyof Counts; label: string }> = [
  { key: "breakfast", label: "Bữa sáng" },
  { key: "lunch", label: "Bữa trưa" },
  { key: "dinner", label: "Bữa tối" },
];
const MIN = 1;
const MAX = 6;

/**
 * Hồ sơ > "Số món mỗi bữa": dishes per meal for new menus (1-6, defaults 3 / 5 / 5), stored in menu-service.
 * In a family it is the family's setting: only the family owner changes it, other members see it read-only.
 * Applies to days generated afterwards; menus already saved are not changed.
 */
export default function MealSizeSettings(): React.JSX.Element {
  const { accessToken } = useSession();
  const api = createGatewayClient(accessToken);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [canEdit, setCanEdit] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.get<Settings>("/api/menu/settings")
      .then(({ canEdit: editable, ...values }) => { setCounts(values); setCanEdit(editable !== false); })
      .catch((error) => setMessage(errorMessage(error)));
  }, [accessToken]);

  const change = async (key: keyof Counts, delta: number) => {
    if (!counts || saving || !canEdit) return;
    const next = { ...counts, [key]: Math.min(MAX, Math.max(MIN, counts[key] + delta)) };
    if (next[key] === counts[key]) return;
    setCounts(next);
    setSaving(true);
    setMessage(null);
    try {
      const { canEdit: _editable, ...saved } = await api.put<Settings>("/api/menu/settings", next);
      setCounts(saved);
      setMessage("Đã lưu. Áp dụng cho thực đơn tạo mới.");
    } catch (error) {
      setCounts(counts);
      setMessage(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!counts) {
    return <View style={local.center}>{message ? <Text style={local.message}>{message}</Text> : <ActivityIndicator color={colors.primary} />}</View>;
  }
  return (
    <View style={local.body}>
      {!canEdit && <Text style={local.note}>Chỉ chủ gia đình mới thay đổi được</Text>}
      {MEALS.map((meal) => (
        <View key={meal.key} style={local.row}>
          <Text style={local.label}>{meal.label}</Text>
          {!canEdit ? (
            <Text style={local.value} accessibilityLabel={`${meal.label}: ${counts[meal.key]} món`}>{counts[meal.key]} món</Text>
          ) : (
          <View style={local.stepper}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Bớt một món ${meal.label.toLocaleLowerCase("vi")}`} disabled={counts[meal.key] <= MIN || saving} onPress={() => void change(meal.key, -1)} style={[local.step, (counts[meal.key] <= MIN || saving) && local.disabled]}>
              <AppIcon icon={Minus} size="sm" color={colors.primary} />
            </Pressable>
            <Text style={local.value} accessibilityLabel={`${meal.label}: ${counts[meal.key]} món`}>{counts[meal.key]} món</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Thêm một món ${meal.label.toLocaleLowerCase("vi")}`} disabled={counts[meal.key] >= MAX || saving} onPress={() => void change(meal.key, 1)} style={[local.step, (counts[meal.key] >= MAX || saving) && local.disabled]}>
              <AppIcon icon={Plus} size="sm" color={colors.primary} />
            </Pressable>
          </View>
          )}
        </View>
      ))}
      {!!message && <Text style={local.message} accessibilityLiveRegion="polite">{message}</Text>}
    </View>
  );
}

const local = StyleSheet.create({
  body: { gap: spacing.md, paddingHorizontal: spacing.lg },
  center: { alignItems: "center", padding: spacing.xl },
  note: { ...textStyles.labelSmall, color: colors.muted },
  row: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", padding: spacing.md },
  label: { ...textStyles.label },
  stepper: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  step: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.sm, height: touchTarget, justifyContent: "center", width: touchTarget },
  value: { ...textStyles.label, minWidth: 56, textAlign: "center" },
  disabled: { opacity: 0.4 },
  message: { ...textStyles.bodySmall, color: colors.primary, textAlign: "center" },
});
