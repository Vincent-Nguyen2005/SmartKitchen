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
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
} from "lucide-react-native";
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

type Props = { apiBaseUrl: string; userId: string };

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

function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("vi-VN");
}

export default function MealDiaryScreen({
  apiBaseUrl,
  userId,
}: Props): React.JSX.Element {
  const api = createMealDiaryApi(apiBaseUrl, userId);
  const [selectedDate, setSelectedDate] = useState(() =>
    utcDateString(new Date()),
  );
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [summary, setSummary] = useState(() =>
    emptySummary(utcDateString(new Date())),
  );
  const [calorieGoal, setCalorieGoal] = useState(2000);
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
        api.getCalorieGoal().catch(() => null),
      ]);
      if (currentRequestId !== requestId.current) return;
      setMeals(history.meals);
      setSummary(
        history.dailySummary.find(
          (dailySummary) => dailySummary.date === date,
        ) ?? emptySummary(date),
      );
      setCalorieGoal(goal && goal > 0 ? Math.round(goal) : 2000);
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
  }, [apiBaseUrl, userId, selectedDate]);

  const moveDate = (amount: number): void => {
    const date = new Date(`${selectedDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    setSelectedDate(utcDateString(date));
  };

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
        loggedAt: `${selectedDate}T${new Date().toISOString().slice(11, 19)}.000Z`,
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
  const isToday = selectedDate === utcDateString(new Date());

  return (
    <SafeAreaView edges={["bottom"]} style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>DINH DƯỠNG HẰNG NGÀY</Text>
          <Text style={styles.title}>Nhật ký bữa ăn</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => openForm()}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <AppIcon icon={Plus} size="sm" color={colors.primaryText} />
          <Text style={styles.addButtonText}>Ghi bữa</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => void loadDiary(selectedDate, true)}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.dateBar}>
          <IconButton
            accessibilityLabel="Ngày trước"
            onPress={() => moveDate(-1)}
            icon={ChevronLeft}
            style={styles.dateArrow}
            color={colors.text}
          />
          <View style={styles.dateCopy}>
            <View style={styles.dateLabelRow}>
              <AppIcon icon={Calendar} size="sm" color={colors.muted} />
              <Text style={styles.dateLabel}>
                {isToday ? "Hôm nay" : "Ngày đã chọn"}
              </Text>
            </View>
            <Text style={styles.dateValue}>{formatDay(selectedDate)}</Text>
          </View>
          <IconButton
            accessibilityLabel="Ngày tiếp theo"
            disabled={isToday}
            onPress={() => moveDate(1)}
            icon={ChevronRight}
            style={[styles.dateArrow, isToday && styles.dateArrowDisabled]}
            color={colors.text}
          />
        </View>

        <View style={styles.summaryPanel}>
          <View style={styles.calorieHeading}>
            <View>
              <Text style={styles.panelEyebrow}>NĂNG LƯỢNG</Text>
              <Text style={styles.calorieValue}>
                {formatNumber(summary.calories)}
                <Text style={styles.calorieUnit}> kcal</Text>
              </Text>
            </View>
            <Text style={styles.goalText}>
              / {formatNumber(calorieGoal)} kcal
            </Text>
          </View>
          <View style={styles.calorieTrack}>
            <View
              style={[
                styles.calorieFill,
                { width: `${calorieProgress * 100}%` },
              ]}
            />
          </View>
          <View style={styles.macroRow}>
            <MacroProgress
              label="Đạm"
              value={summary.protein}
              goal={proteinGoal}
              color={colors.success}
            />
            <MacroProgress
              label="Tinh bột"
              value={summary.carbs}
              goal={carbsGoal}
              color={colors.warning}
            />
            <MacroProgress
              label="Chất béo"
              value={summary.fat}
              goal={fatGoal}
              color={colors.danger}
            />
          </View>
          <Text style={styles.goalNote}>
            {calorieGoal === 2000
              ? "Mục tiêu mặc định · cập nhật hồ sơ để cá nhân hóa"
              : "Mục tiêu calo lấy từ hồ sơ dinh dưỡng"}
          </Text>
        </View>

        <View style={styles.mealHeading}>
          <Text style={styles.sectionTitle}>Các bữa trong ngày</Text>
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
            <AppIcon icon={Plus} size="lg" color={colors.primary} />
            <Text style={styles.emptyTitle}>Bắt đầu ghi nhật ký</Text>
            <Text style={styles.emptyCopy}>
              Món ăn đầu tiên trong ngày sẽ xuất hiện ở đây.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => openForm()}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Ghi món đầu tiên</Text>
            </Pressable>
          </View>
        ) : (
          mealTypes.map((option) => {
            const sectionMeals = meals.filter(
              (meal) => meal.mealType === option.value,
            );
            return (
              <View key={option.value} style={styles.mealSection}>
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
                    <MealEntry key={meal.id} meal={meal} />
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
  label,
  value,
  goal,
  color,
}: {
  label: string;
  value: number;
  goal: number;
  color: string;
}): React.JSX.Element {
  const progress = Math.min(value / Math.max(goal, 1), 1);
  return (
    <View style={styles.macroItem}>
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

function MealEntry({ meal }: { meal: MealLog }): React.JSX.Element {
  return (
    <View style={styles.mealEntry}>
      <View style={styles.mealEntryTop}>
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
        <View key={item.id} style={styles.foodRow}>
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
          <Text style={styles.foodCalories}>
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
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.modalScrim}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalKeyboard}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeading}>
              <View>
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

            <ScrollView
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

              <Text style={styles.fieldLabel}>Dinh dưỡng đa lượng</Text>
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
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: "center",
    backgroundColor: colors.surface,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  headingCopy: { flex: 1, paddingRight: spacing.sm },
  eyebrow: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: "700",
  },
  title: {
    ...textStyles.heading,
    marginTop: spacing.xs,
  },
  addButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
  },
  addButtonText: {
    ...textStyles.caption,
    color: colors.primaryText,
    fontWeight: "700",
  },
  pressed: { opacity: 0.82 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  dateBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  dateArrow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  dateArrowDisabled: { opacity: 0.5 },
  dateCopy: { alignItems: "center", flex: 1 },
  dateLabelRow: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  dateLabel: {
    ...textStyles.caption,
    color: colors.muted,
    fontWeight: "700",
  },
  dateValue: {
    ...textStyles.labelSmall,
    color: colors.text,
    marginTop: spacing.xs,
  },
  summaryPanel: {
    backgroundColor: colors.text,
    borderRadius: radius.sm,
    padding: spacing.lg,
  },
  calorieHeading: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  panelEyebrow: {
    ...textStyles.caption,
    color: colors.primarySoft,
    fontWeight: "700",
  },
  calorieValue: {
    ...textStyles.heading,
    color: colors.surface,
    marginTop: spacing.xs,
  },
  calorieUnit: {
    ...textStyles.labelSmall,
    color: colors.primarySoft,
  },
  goalText: {
    ...textStyles.caption,
    color: colors.primarySoft,
    marginBottom: spacing.xs,
  },
  calorieTrack: {
    backgroundColor: colors.muted,
    borderRadius: radius.pill,
    height: spacing.sm,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  calorieFill: {
    backgroundColor: colors.warning,
    borderRadius: radius.pill,
    height: "100%",
  },
  macroRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  macroItem: { flex: 1, minWidth: 0 },
  macroLabel: {
    ...textStyles.caption,
    color: colors.primarySoft,
    fontWeight: "700",
  },
  macroValue: {
    ...textStyles.caption,
    color: colors.surface,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  macroGoal: {
    ...textStyles.caption,
    color: colors.border,
    fontWeight: "500",
  },
  macroTrack: {
    backgroundColor: colors.muted,
    borderRadius: radius.pill,
    height: spacing.xs,
    marginTop: spacing.xs,
    overflow: "hidden",
  },
  macroFill: { borderRadius: radius.pill, height: "100%" },
  goalNote: {
    ...textStyles.caption,
    color: colors.border,
    marginTop: spacing.md,
  },
  mealHeading: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
    marginTop: spacing.xl,
  },
  sectionTitle: {
    ...textStyles.heading,
    color: colors.text,
  },
  mealCount: { ...textStyles.caption, color: colors.muted },
  loader: { marginTop: spacing.xl * 2 },
  emptyState: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    ...textStyles.subheading,
    color: colors.text,
    marginTop: spacing.sm,
  },
  emptyCopy: {
    ...textStyles.caption,
    color: colors.muted,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    marginTop: spacing.md,
    minHeight: touchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  retryText: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: "700",
  },
  mealSection: { marginTop: spacing.lg },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sectionName: {
    ...textStyles.label,
    color: colors.text,
  },
  sectionAdd: {
    alignItems: "center",
    flexDirection: "row",
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  mealEntryTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
  },
  mealTime: {
    ...textStyles.caption,
    color: colors.muted,
    fontWeight: "700",
  },
  sourceBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  source_HOME: { backgroundColor: colors.successSoft },
  source_EATING_OUT: { backgroundColor: colors.warningSoft },
  source_DELIVERY: { backgroundColor: colors.dangerSoft },
  sourceText: { ...textStyles.caption, fontWeight: "700" },
  sourceText_HOME: { color: colors.success },
  sourceText_EATING_OUT: { color: colors.warning },
  sourceText_DELIVERY: { color: colors.danger },
  foodRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: touchTarget,
    paddingVertical: spacing.sm,
  },
  foodCopy: { flex: 1, paddingRight: spacing.md },
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
    color: colors.text,
    fontWeight: "700",
  },
  modalScrim: {
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: "flex-end",
  },
  modalKeyboard: { justifyContent: "flex-end", maxHeight: "94%" },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    maxHeight: "100%",
    paddingTop: spacing.lg,
  },
  modalHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  modalEyebrow: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: "700",
  },
  modalTitle: {
    ...textStyles.heading,
    color: colors.text,
    marginTop: spacing.xs,
  },
  closeButton: {
    backgroundColor: colors.border,
    borderRadius: radius.pill,
  },
  formContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  fieldLabel: {
    ...textStyles.caption,
    color: colors.text,
    fontWeight: "700",
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    ...textStyles.body,
    color: colors.text,
    minHeight: touchTarget + spacing.xs,
    paddingHorizontal: spacing.md,
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  choiceChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    minHeight: touchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  choiceChipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  choiceText: {
    ...textStyles.caption,
    color: colors.muted,
    fontWeight: "700",
  },
  choiceTextSelected: { color: colors.primary },
  numberInput: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: touchTarget + spacing.xs,
    paddingHorizontal: spacing.md,
  },
  numberText: {
    flex: 1,
    ...textStyles.bodySmall,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  numberUnit: {
    ...textStyles.caption,
    color: colors.muted,
    fontWeight: "700",
  },
  macroInputs: { flexDirection: "row", gap: spacing.sm },
  formError: {
    ...textStyles.caption,
    color: colors.danger,
    marginTop: spacing.md,
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    justifyContent: "center",
    marginTop: spacing.lg,
    minHeight: touchTarget + spacing.sm,
  },
  saveButtonText: {
    ...textStyles.labelSmall,
    color: colors.primaryText,
  },
  disabled: { opacity: 0.58 },
});
