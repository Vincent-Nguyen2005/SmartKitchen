import { useSession } from "../../services/session";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Plus, X } from "lucide-react-native";
import { DaySwitcher, vnToday } from "../nutrition/DaySwitcher";
import { ProfileMissingCard } from "../nutrition/ProfileMissingCard";
import {
  AppIcon,
  IconButton,
  colors,
  radius,
  spacing,
  textStyles,
  touchTarget,
} from "../../theme";
import {
  createMealDiaryApi,
  DailyMealSummary,
  MealLog,
  MealSource,
  MealType,
} from "./mealDiaryApi";

/** onOpenProfile switches the Dinh dưỡng tab to the "Hồ sơ" segment. */
type Props = { onOpenProfile?: () => void };

const mealTypes: { value: MealType; label: string }[] = [
  { value: "BREAKFAST", label: "Bữa sáng" },
  { value: "LUNCH", label: "Bữa trưa" },
  { value: "DINNER", label: "Bữa tối" },
  { value: "SNACK", label: "Ăn nhẹ" },
];

const mealSources: { value: MealSource; label: string }[] = [
  { value: "HOME", label: "Ở nhà" },
  { value: "EATING_OUT", label: "Ăn ngoài" },
  { value: "DELIVERY", label: "Giao tận nơi" },
];

const mealSourceLabels: Record<MealSource, string> = {
  HOME: "Ở nhà",
  EATING_OUT: "Ăn ngoài",
  DELIVERY: "Giao tận nơi",
};

const emptySummary = (date: string): DailyMealSummary => ({
  date,
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
});

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("vi-VN");
}

export default function MealDiaryScreen({ onOpenProfile }: Props): React.JSX.Element {
  const { width: screenWidth } = useWindowDimensions();
  const isCompact = screenWidth < 400;
  const { accessToken } = useSession();
  const api = createMealDiaryApi(accessToken);
  // Selected calendar day, YYYY-MM-DD; defaults to today in Vietnam time.
  const [selectedDate, setSelectedDate] = useState(() => vnToday());
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [summary, setSummary] = useState(() =>
    emptySummary(vnToday()),
  );
  const [calorieGoal, setCalorieGoal] = useState(2000);
  // true when GET /api/nutrition answers 404: no profile, so no personal calorie goal.
  const [profileMissing, setProfileMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [foodName, setFoodName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [mealType, setMealType] = useState<MealType>("BREAKFAST");
  const [source, setSource] = useState<MealSource>("HOME");
  const requestId = useRef(0);

  const loadDiary = async (date: string, isRefresh: boolean): Promise<void> => {
    const currentRequestId = ++requestId.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const [history, goal] = await Promise.all([
        api.getHistory(date),
        api.getCalorieGoal()
          .then((tdee) => ({ tdee, missing: tdee === null }))
          .catch(() => ({ tdee: null, missing: false })),
      ]);
      if (currentRequestId !== requestId.current) return;
      setMeals(history.meals);
      setSummary(
        history.dailySummary.find(
          (dailySummary) => dailySummary.date === date,
        ) ?? emptySummary(date),
      );
      setCalorieGoal(goal.tdee !== null ? Math.round(goal.tdee) : 2000);
      setProfileMissing(goal.missing);
    } catch {
      if (currentRequestId === requestId.current) {
        setError("Không thể tải nhật ký. Kiểm tra kết nối rồi thử lại.");
      }
    } finally {
      if (currentRequestId === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    void loadDiary(selectedDate, false);
    return () => {
      requestId.current += 1;
    };
  }, [accessToken, selectedDate]);

  const openForm = (selectedMealType: MealType = "BREAKFAST"): void => {
    setFoodName("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFat("");
    setMealType(selectedMealType);
    setSource("HOME");
    setFormError("");
    setModalVisible(true);
  };

  const saveMeal = async (): Promise<void> => {
    const parsedCalories = Number(calories);
    const optionalMacro = (value: string): number | undefined => {
      if (!value.trim()) return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : NaN;
    };
    const macros = {
      protein: optionalMacro(protein),
      carbs: optionalMacro(carbs),
      fat: optionalMacro(fat),
    };

    if (!foodName.trim()) {
      setFormError("Nhập tên món ăn trước khi lưu.");
      return;
    }
    if (!Number.isFinite(parsedCalories) || parsedCalories < 0) {
      setFormError("Calo phải là một số không âm.");
      return;
    }
    if (Object.values(macros).some((value) => Number.isNaN(value))) {
      setFormError("Các chỉ số dinh dưỡng phải là số không âm.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      await api.logMeal({
        mealType,
        source,
        date: selectedDate,
        items: [
          {
            foodName: foodName.trim(),
            calories: parsedCalories,
            quantity: 1,
            unit: "serving",
            ...macros,
          },
        ],
      });
      setModalVisible(false);
      await loadDiary(selectedDate, true);
    } catch {
      setFormError("Không thể lưu món ăn. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  const calorieProgress = Math.min(summary.calories / calorieGoal, 1);
  const proteinGoal = Math.round((calorieGoal * 0.2) / 4);
  const carbsGoal = Math.round((calorieGoal * 0.5) / 4);
  const fatGoal = Math.round((calorieGoal * 0.3) / 9);
  const isToday = selectedDate === vnToday();

  return (
    <SafeAreaView edges={["bottom"]} style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.content, isCompact && styles.contentCompact]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            tintColor={colors.primary}
            refreshing={refreshing}
            onRefresh={() => void loadDiary(selectedDate, true)}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>DINH DƯỠNG MỖI NGÀY</Text>
          <Text style={styles.title}>Nhật ký bữa ăn</Text>
          <Text style={styles.headerSubtitle}>
            Theo dõi bữa ăn và năng lượng của bạn.
          </Text>
        </View>

        <DaySwitcher value={selectedDate} onChange={setSelectedDate} />

        <View style={styles.summaryPanel}>
          <View style={[styles.calorieHeading, isCompact && styles.calorieHeadingCompact]}>
            <View style={[styles.calorieCopy, isCompact && styles.calorieCopyCompact]}>
              <Text style={styles.panelEyebrow}>Đã nạp</Text>
              <Text style={styles.calorieValue}>
                {formatNumber(summary.calories)}
                <Text style={styles.calorieUnit}> kcal</Text>
              </Text>
            </View>
            <View style={[styles.goalCopy, isCompact && styles.goalCopyCompact]}>
              <Text style={styles.panelEyebrow}>Mục tiêu</Text>
              <Text style={styles.goalText}>
                {profileMissing ? "Chưa có" : `${formatNumber(calorieGoal)} kcal`}
              </Text>
            </View>
          </View>

          {profileMissing ? (
            <ProfileMissingCard onOpenProfile={onOpenProfile} />
          ) : (
            <>
            <View style={styles.calorieTrack}>
              <View
                style={[
                  styles.calorieFill,
                  { width: `${calorieProgress * 100}%` },
                ]}
              />
            </View>
            <View style={[styles.progressCaption, isCompact && styles.progressCaptionCompact]}>
              <Text style={styles.progressText}>
                {Math.round((summary.calories / calorieGoal) * 100)}% mục tiêu
              </Text>
              <Text style={styles.progressText}>
                {summary.calories > calorieGoal
                  ? `Vượt ${formatNumber(summary.calories - calorieGoal)} kcal`
                  : `Còn ${formatNumber(calorieGoal - summary.calories)} kcal`}
              </Text>
            </View>
            </>
          )}

          <View style={styles.macroDivider} />
          <Text style={styles.macroHeading}>Dinh dưỡng trong ngày</Text>
          <View style={[styles.macroRow, isCompact && styles.macroRowCompact]}>
            <MacroProgress
              compact={isCompact}
              label="Đạm"
              value={summary.protein}
              goal={proteinGoal}
              color={colors.success}
            />
            <MacroProgress
              compact={isCompact}
              label="Tinh bột"
              value={summary.carbs}
              goal={carbsGoal}
              color={colors.warning}
            />
            <MacroProgress
              compact={isCompact}
              label="Chất béo"
              value={summary.fat}
              goal={fatGoal}
              color={colors.danger}
            />
          </View>
          <Text style={styles.goalNote}>
            {profileMissing || calorieGoal === 2000
              ? "Mục tiêu đạm, tinh bột, chất béo đang tạm tính theo 2.000 kcal"
              : "Mục tiêu theo hồ sơ dinh dưỡng"}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thêm bữa ăn vào nhật ký"
          onPress={() => openForm()}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <AppIcon icon={Plus} size="sm" color={colors.primaryText} />
          <Text style={styles.addButtonText}>Thêm bữa ăn</Text>
        </Pressable>

        <View style={styles.mealHeading}>
          <Text style={styles.sectionTitle}>Các bữa ăn</Text>
          <Text style={styles.mealCount}>{meals.length} bữa đã ghi</Text>
        </View>

        {loading ? (
          <ActivityIndicator
            color={colors.primary}
            size="large"
            style={styles.loader}
          />
        ) : error ? (
          <View style={styles.emptyState}>
            <Text accessibilityRole="alert" style={styles.emptyTitle}>
              Chưa thể tải dữ liệu
            </Text>
            <Text style={styles.emptyCopy}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadDiary(selectedDate, false)}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Thử lại</Text>
            </Pressable>
          </View>
        ) : meals.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Chưa có bữa ăn nào</Text>
            <Text style={styles.emptyCopy}>
              Nhấn “Thêm bữa ăn” để bắt đầu ghi nhật ký.
            </Text>
          </View>
        ) : (
          mealTypes.map((option) => {
            const sectionMeals = meals.filter(
              (meal) => meal.mealType === option.value,
            );
            return (
              <View key={option.value} style={[styles.mealSection, isCompact && styles.mealSectionCompact]}>
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionName}>{option.label}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Ghi ${option.label.toLowerCase()}`}
                    onPress={() => openForm(option.value)}
                    style={styles.sectionAdd}
                  >
                    <AppIcon icon={Plus} size="sm" color={colors.primary} />
                    <Text style={styles.sectionAddText}>Thêm</Text>
                  </Pressable>
                </View>
                {sectionMeals.length > 0 ? (
                  sectionMeals.map((meal) => (
                    <MealEntry key={meal.id} meal={meal} compact={isCompact} />
                  ))
                ) : (
                  <Text style={styles.sectionEmpty}>Chưa ghi món</Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <MealFormModal
        visible={modalVisible}
        saving={saving}
        foodName={foodName}
        calories={calories}
        protein={protein}
        carbs={carbs}
        fat={fat}
        mealType={mealType}
        source={source}
        dateLabel={isToday ? "NHẬT KÝ HÔM NAY" : "NHẬT KÝ NGÀY ĐÃ CHỌN"}
        error={formError}
        onClose={() => setModalVisible(false)}
        onSave={() => void saveMeal()}
        onFoodNameChange={setFoodName}
        onCaloriesChange={setCalories}
        onProteinChange={setProtein}
        onCarbsChange={setCarbs}
        onFatChange={setFat}
        onMealTypeChange={setMealType}
        onSourceChange={setSource}
      />
    </SafeAreaView>
  );
}

function MacroProgress({
  compact,
  label,
  value,
  goal,
  color,
}: {
  compact: boolean;
  label: string;
  value: number;
  goal: number;
  color: string;
}): React.JSX.Element {
  const progress = Math.min(value / Math.max(goal, 1), 1);
  return (
    <View style={[styles.macroItem, compact && styles.macroItemCompact]}>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValue}>
        {formatNumber(value)} <Text style={styles.macroGoal}>/ {goal} g</Text>
      </Text>
      <View style={styles.macroTrack}>
        <View
          style={[
            styles.macroFill,
            { backgroundColor: color, width: `${progress * 100}%` },
          ]}
        />
      </View>
    </View>
  );
}

function MealEntry({ meal, compact }: { meal: MealLog; compact: boolean }): React.JSX.Element {
  return (
    <View style={styles.mealEntry}>
      <View style={[styles.mealEntryTop, compact && styles.mealEntryTopCompact]}>
        <Text style={styles.mealTime}>
          {new Date(meal.loggedAt).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
        <View style={[styles.sourceBadge, styles[`source_${meal.source}`]]}>
          <Text
            style={[styles.sourceText, styles[`sourceText_${meal.source}`]]}
          >
            {mealSourceLabels[meal.source]}
          </Text>
        </View>
      </View>
      {meal.items.map((item) => (
        <View key={item.id} style={[styles.foodRow, compact && styles.foodRowCompact]}>
          <View style={styles.foodCopy}>
            <Text style={styles.foodName}>{item.foodName}</Text>
            <Text style={styles.foodDetails}>
              {item.quantity > 1 ? `${item.quantity} phần · ` : ""}
              {[
                item.protein != null &&
                  `${formatNumber(item.protein * item.quantity)}g đạm`,
                item.carbs != null &&
                  `${formatNumber(item.carbs * item.quantity)}g tinh bột`,
                item.fat != null &&
                  `${formatNumber(item.fat * item.quantity)}g béo`,
              ]
                .filter(Boolean)
                .join(" · ") || "Thông tin dinh dưỡng chưa đầy đủ"}
            </Text>
          </View>
          <Text style={[styles.foodCalories, compact && styles.foodCaloriesCompact]}>
            {formatNumber(item.calories * item.quantity)} kcal
          </Text>
        </View>
      ))}
    </View>
  );
}

function MealFormModal({
  visible,
  saving,
  foodName,
  calories,
  protein,
  carbs,
  fat,
  mealType,
  source,
  dateLabel,
  error,
  onClose,
  onSave,
  onFoodNameChange,
  onCaloriesChange,
  onProteinChange,
  onCarbsChange,
  onFatChange,
  onMealTypeChange,
  onSourceChange,
}: {
  visible: boolean;
  saving: boolean;
  foodName: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  mealType: MealType;
  source: MealSource;
  dateLabel: string;
  error: string;
  onClose: () => void;
  onSave: () => void;
  onFoodNameChange: (value: string) => void;
  onCaloriesChange: (value: string) => void;
  onProteinChange: (value: string) => void;
  onCarbsChange: (value: string) => void;
  onFatChange: (value: string) => void;
  onMealTypeChange: (value: MealType) => void;
  onSourceChange: (value: MealSource) => void;
}): React.JSX.Element {
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= 768;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={[styles.modalScrim, isDesktop && styles.modalScrimDesktop]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.modalKeyboard, isDesktop && styles.modalKeyboardDesktop]}
        >
          <View style={[styles.modalSheet, isDesktop && styles.modalSheetDesktop]}>
            <View style={styles.modalHeading}>
              <View style={styles.modalHeadingCopy}>
                <Text style={styles.modalEyebrow}>{dateLabel}</Text>
                <Text style={styles.modalTitle}>Thêm món ăn</Text>
              </View>
              <IconButton
                accessibilityLabel="Đóng biểu mẫu"
                onPress={onClose}
                icon={X}
                style={styles.closeButton}
                color={colors.text}
              />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.fieldLabel}>Tên món ăn</Text>
              <TextInput
                accessibilityLabel="Tên món ăn"
                autoCapitalize="sentences"
                onChangeText={onFoodNameChange}
                placeholder="Ví dụ: Cơm gà"
                placeholderTextColor={colors.muted}
                style={styles.textInput}
                value={foodName}
              />

              <Text style={styles.fieldLabel}>Bữa ăn</Text>
              <View style={styles.choiceRow}>
                {mealTypes.map((option) => (
                  <ChoiceChip
                    key={option.value}
                    label={option.label}
                    selected={mealType === option.value}
                    onPress={() => onMealTypeChange(option.value)}
                  />
                ))}
              </View>

              <Text style={styles.fieldLabel}>Nguồn bữa ăn</Text>
              <View style={styles.choiceRow}>
                {mealSources.map((option) => (
                  <ChoiceChip
                    key={option.value}
                    label={option.label}
                    selected={source === option.value}
                    onPress={() => onSourceChange(option.value)}
                  />
                ))}
              </View>

              <Text style={styles.fieldLabel}>Năng lượng</Text>
              <NumberInput
                accessibilityLabel="Calo"
                onChangeText={onCaloriesChange}
                placeholder="0"
                unit="kcal"
                value={calories}
              />

              <Text style={styles.fieldLabel}>
                Thành phần dinh dưỡng (nếu biết)
              </Text>
              <View style={styles.macroInputs}>
                <NumberInput
                  accessibilityLabel="Đạm"
                  onChangeText={onProteinChange}
                  placeholder="0"
                  unit="g đạm"
                  value={protein}
                />
                <NumberInput
                  accessibilityLabel="Tinh bột"
                  onChangeText={onCarbsChange}
                  placeholder="0"
                  unit="g carb"
                  value={carbs}
                />
                <NumberInput
                  accessibilityLabel="Chất béo"
                  onChangeText={onFatChange}
                  placeholder="0"
                  unit="g béo"
                  value={fat}
                />
              </View>
              <Text style={styles.formHint}>
                Bạn có thể bỏ trống các chỉ số chưa biết.
              </Text>

              {!!error && (
                <Text accessibilityRole="alert" style={styles.formError}>
                  {error}
                </Text>
              )}
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={onSave}
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && styles.pressed,
                  saving && styles.disabled,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={colors.primaryText} />
                ) : (
                  <Text style={styles.saveButtonText}>Lưu món ăn</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function NumberInput({
  accessibilityLabel,
  onChangeText,
  placeholder,
  unit,
  value,
}: {
  accessibilityLabel: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  unit: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.numberInput}>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        keyboardType="decimal-pad"
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.numberText}
        value={value}
      />
      <Text style={styles.numberUnit}>{unit}</Text>
    </View>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choiceChip, selected && styles.choiceChipSelected]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // SCRUM-232: page width is capped on desktop, while narrow phones stack
  // densely packed summary/meal rows rather than squeeze their content.
  contentCompact: { paddingHorizontal: spacing.md },
  calorieHeadingCompact: { flexDirection: "column", alignItems: "flex-start" },
  calorieCopyCompact: { flex: 0 },
  goalCopyCompact: { alignItems: "flex-start" },
  progressCaptionCompact: { flexWrap: "wrap" },
  macroRowCompact: { flexDirection: "column" },
  macroItemCompact: { flex: 0, width: "100%" },
  mealSectionCompact: { paddingHorizontal: spacing.sm },
  mealEntryTopCompact: { flexWrap: "wrap", gap: spacing.xs },
  foodRowCompact: { flexWrap: "wrap", alignItems: "flex-start" },
  foodCaloriesCompact: { textAlign: "left" },
  modalScrimDesktop: { justifyContent: "center", alignItems: "center", padding: spacing.lg },
  modalKeyboardDesktop: { alignSelf: "center", width: "100%", maxWidth: 680 },
  modalSheetDesktop: { borderRadius: radius.md },
  modalHeadingCopy: { flex: 1, minWidth: 0, paddingRight: spacing.sm },
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl * 2,
    width: "100%",
    maxWidth: 920,
    alignSelf: "center",
  },
  header: {
    marginBottom: spacing.lg,
  },
  eyebrow: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: "700",
  },
  title: {
    ...textStyles.heading,
    color: colors.text,
    marginTop: spacing.xs,
  },
  headerSubtitle: {
    ...textStyles.bodySmall,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  summaryPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  calorieHeading: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  calorieCopy: {
    flex: 1,
  },
  goalCopy: {
    alignItems: "flex-end",
    paddingBottom: spacing.xs,
  },
  panelEyebrow: {
    ...textStyles.caption,
    color: colors.muted,
  },
  calorieValue: {
    ...textStyles.heading,
    color: colors.text,
    marginTop: spacing.xs,
  },
  calorieUnit: {
    ...textStyles.bodySmall,
    color: colors.muted,
  },
  goalText: {
    ...textStyles.labelSmall,
    color: colors.text,
    marginTop: spacing.xs,
  },
  calorieTrack: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    height: spacing.sm,
    overflow: "hidden",
    marginTop: spacing.lg,
  },
  calorieFill: {
    backgroundColor: colors.primary,
    height: "100%",
    borderRadius: radius.pill,
  },
  progressCaption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  progressText: {
    ...textStyles.caption,
    color: colors.muted,
  },
  macroDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  macroHeading: {
    ...textStyles.labelSmall,
    color: colors.text,
  },
  macroRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  macroItem: {
    flex: 1,
    minWidth: 0,
  },
  macroLabel: {
    ...textStyles.caption,
    color: colors.muted,
  },
  macroValue: {
    ...textStyles.labelSmall,
    color: colors.text,
    marginTop: spacing.xs,
  },
  macroGoal: {
    ...textStyles.caption,
    color: colors.muted,
  },
  macroTrack: {
    height: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    overflow: "hidden",
    marginTop: spacing.sm,
  },
  macroFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  goalNote: {
    ...textStyles.caption,
    color: colors.muted,
    marginTop: spacing.lg,
  },
  addButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: touchTarget + spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    marginTop: spacing.md,
  },
  addButtonText: {
    ...textStyles.labelSmall,
    color: colors.primaryText,
  },
  pressed: {
    opacity: 0.82,
  },
  mealHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...textStyles.subheading,
    color: colors.text,
  },
  mealCount: {
    ...textStyles.caption,
    color: colors.muted,
  },
  loader: {
    marginTop: spacing.xl,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.xl,
    minHeight: touchTarget * 3,
  },
  emptyTitle: {
    ...textStyles.subheading,
    color: colors.text,
    textAlign: "center",
  },
  emptyCopy: {
    ...textStyles.bodySmall,
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  retryButton: {
    minHeight: touchTarget,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  retryText: {
    ...textStyles.labelSmall,
    color: colors.primary,
  },
  mealSection: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sectionName: {
    ...textStyles.label,
    color: colors.text,
  },
  sectionAdd: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: touchTarget,
    paddingHorizontal: spacing.sm,
  },
  sectionAddText: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: "700",
  },
  sectionEmpty: {
    ...textStyles.caption,
    color: colors.muted,
    paddingVertical: spacing.sm,
  },
  mealEntry: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: spacing.xs,
    paddingTop: spacing.md,
  },
  mealEntryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  mealTime: {
    ...textStyles.caption,
    color: colors.muted,
  },
  sourceBadge: {
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  source_HOME: { backgroundColor: colors.successSoft },
  source_EATING_OUT: { backgroundColor: colors.warningSoft },
  source_DELIVERY: { backgroundColor: colors.dangerSoft },
  sourceText: { ...textStyles.caption, color: colors.muted },
  sourceText_HOME: { color: colors.success },
  sourceText_EATING_OUT: { color: colors.warning },
  sourceText_DELIVERY: { color: colors.danger },
  foodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: touchTarget,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  foodCopy: {
    flex: 1,
    minWidth: 0,
  },
  foodName: {
    ...textStyles.labelSmall,
    color: colors.text,
  },
  foodDetails: {
    ...textStyles.caption,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  foodCalories: {
    ...textStyles.caption,
    flexShrink: 1,
    color: colors.text,
    fontWeight: "700",
    textAlign: "right",
  },
  modalScrim: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlay,
  },
  modalKeyboard: {
    justifyContent: "flex-end",
    maxHeight: "94%",
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    maxHeight: "100%",
    paddingTop: spacing.lg,
  },
  modalHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  modalEyebrow: {
    ...textStyles.caption,
    color: colors.primary,
  },
  modalTitle: {
    ...textStyles.subheading,
    color: colors.text,
    marginTop: spacing.xs,
  },
  closeButton: {
    backgroundColor: colors.background,
    borderRadius: radius.pill,
  },
  formContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  fieldLabel: {
    ...textStyles.labelSmall,
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  textInput: {
    ...textStyles.body,
    minHeight: touchTarget + spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    color: colors.text,
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  choiceChip: {
    justifyContent: "center",
    minHeight: touchTarget,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
  },
  choiceChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  choiceText: {
    ...textStyles.caption,
    color: colors.muted,
  },
  choiceTextSelected: {
    color: colors.primary,
    fontWeight: "700",
  },
  numberInput: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: touchTarget + spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.background,
  },
  numberText: {
    ...textStyles.bodySmall,
    flex: 1,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  numberUnit: {
    ...textStyles.caption,
    color: colors.muted,
  },
  macroInputs: {
    gap: spacing.sm,
  },
  formHint: {
    ...textStyles.caption,
    color: colors.muted,
    marginTop: spacing.sm,
  },
  formError: {
    ...textStyles.caption,
    color: colors.danger,
    marginTop: spacing.md,
  },
  saveButton: {
    minHeight: touchTarget + spacing.sm,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    marginTop: spacing.lg,
  },
  saveButtonText: {
    ...textStyles.labelSmall,
    color: colors.primaryText,
  },
  disabled: { opacity: 0.58 },
});
