import React, { useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
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
          <Text style={styles.addButtonText}>+ Ghi bữa</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={["#28735D"]}
            onRefresh={() => void loadDiary(selectedDate, true)}
            refreshing={refreshing}
            tintColor="#28735D"
          />
        }
      >
        <View style={styles.dateBar}>
          <Pressable
            accessibilityLabel="Ngày trước"
            accessibilityRole="button"
            onPress={() => moveDate(-1)}
            style={styles.dateArrow}
          >
            <Text style={styles.dateArrowText}>‹</Text>
          </Pressable>
          <View style={styles.dateCopy}>
            <Text style={styles.dateLabel}>
              {isToday ? "Hôm nay" : "Ngày đã chọn"}
            </Text>
            <Text style={styles.dateValue}>{formatDay(selectedDate)}</Text>
          </View>
          <Pressable
            accessibilityLabel="Ngày tiếp theo"
            accessibilityRole="button"
            disabled={isToday}
            onPress={() => moveDate(1)}
            style={[styles.dateArrow, isToday && styles.dateArrowDisabled]}
          >
            <Text style={styles.dateArrowText}>›</Text>
          </Pressable>
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
              color="#9ED5BD"
            />
            <MacroProgress
              label="Tinh bột"
              value={summary.carbs}
              goal={carbsGoal}
              color="#F3C46B"
            />
            <MacroProgress
              label="Chất béo"
              value={summary.fat}
              goal={fatGoal}
              color="#F39A7A"
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
            color="#28735D"
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
            <Text style={styles.emptyMark}>+</Text>
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
                    <Text style={styles.sectionAddText}>+ Thêm</Text>
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
              <Pressable
                accessibilityLabel="Đóng biểu mẫu"
                accessibilityRole="button"
                onPress={onClose}
                style={styles.closeButton}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
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
                placeholderTextColor="#8A958E"
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
                  <ActivityIndicator color="#FFFFFF" />
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
        placeholderTextColor="#8A958E"
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
  safeArea: { backgroundColor: "#F4F7F2", flex: 1 },
  header: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 15,
  },
  headingCopy: { flex: 1, paddingRight: 8 },
  eyebrow: { color: "#28735D", fontSize: 10, fontWeight: "800" },
  title: { color: "#182A24", fontSize: 24, fontWeight: "800", marginTop: 4 },
  addButton: {
    alignItems: "center",
    backgroundColor: "#28735D",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 14,
  },
  addButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.82 },
  content: { paddingHorizontal: 18, paddingBottom: 32 },
  dateBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    marginTop: 15,
  },
  dateArrow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#DEE6DF",
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  dateArrowDisabled: { opacity: 0.35 },
  dateArrowText: { color: "#263A31", fontSize: 28, lineHeight: 32 },
  dateCopy: { alignItems: "center", flex: 1 },
  dateLabel: { color: "#718078", fontSize: 11, fontWeight: "700" },
  dateValue: {
    color: "#263A31",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 3,
  },
  summaryPanel: { backgroundColor: "#183D32", borderRadius: 10, padding: 18 },
  calorieHeading: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  panelEyebrow: { color: "#B9D1C3", fontSize: 10, fontWeight: "800" },
  calorieValue: {
    color: "#FFFFFF",
    fontSize: 31,
    fontWeight: "800",
    marginTop: 4,
  },
  calorieUnit: { color: "#D2E0D7", fontSize: 14, fontWeight: "700" },
  goalText: { color: "#D2E0D7", fontSize: 12, marginBottom: 5 },
  calorieTrack: {
    backgroundColor: "#46665A",
    borderRadius: 4,
    height: 7,
    marginTop: 13,
    overflow: "hidden",
  },
  calorieFill: { backgroundColor: "#F3C46B", borderRadius: 4, height: "100%" },
  macroRow: { flexDirection: "row", gap: 12, marginTop: 20 },
  macroItem: { flex: 1, minWidth: 0 },
  macroLabel: { color: "#C2D6CA", fontSize: 11, fontWeight: "700" },
  macroValue: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
  },
  macroGoal: { color: "#AFC5B8", fontSize: 10, fontWeight: "500" },
  macroTrack: {
    backgroundColor: "#46665A",
    borderRadius: 3,
    height: 4,
    marginTop: 7,
    overflow: "hidden",
  },
  macroFill: { borderRadius: 3, height: "100%" },
  goalNote: { color: "#AFC5B8", fontSize: 10, marginTop: 14 },
  mealHeading: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
    marginTop: 23,
  },
  sectionTitle: { color: "#182A24", fontSize: 18, fontWeight: "800" },
  mealCount: { color: "#7A8880", fontSize: 11 },
  loader: { marginTop: 55 },
  emptyState: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E9E3",
    borderRadius: 9,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  emptyMark: { color: "#28735D", fontSize: 28, fontWeight: "500" },
  emptyTitle: {
    color: "#263A31",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 8,
  },
  emptyCopy: {
    color: "#718078",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    textAlign: "center",
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: "#E6F0E9",
    borderRadius: 7,
    marginTop: 14,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  retryText: { color: "#205540", fontSize: 13, fontWeight: "800" },
  mealSection: { marginTop: 18 },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  sectionName: { color: "#263A31", fontSize: 15, fontWeight: "800" },
  sectionAdd: { paddingHorizontal: 7, paddingVertical: 5 },
  sectionAddText: { color: "#28735D", fontSize: 12, fontWeight: "800" },
  sectionEmpty: { color: "#89958E", fontSize: 12, paddingVertical: 9 },
  mealEntry: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E1E8E2",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 13,
    paddingTop: 10,
  },
  mealEntryTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  mealTime: { color: "#75837B", fontSize: 11, fontWeight: "700" },
  sourceBadge: { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4 },
  source_HOME: { backgroundColor: "#E5F2E9" },
  source_EATING_OUT: { backgroundColor: "#FFF0D7" },
  source_DELIVERY: { backgroundColor: "#FCE8E2" },
  sourceText: { fontSize: 10, fontWeight: "800" },
  sourceText_HOME: { color: "#28735D" },
  sourceText_EATING_OUT: { color: "#976313" },
  sourceText_DELIVERY: { color: "#A94E36" },
  foodRow: {
    alignItems: "center",
    borderTopColor: "#EDF1ED",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 54,
    paddingVertical: 9,
  },
  foodCopy: { flex: 1, paddingRight: 10 },
  foodName: { color: "#263A31", fontSize: 14, fontWeight: "700" },
  foodDetails: { color: "#829087", fontSize: 10, marginTop: 4 },
  foodCalories: { color: "#183D32", fontSize: 12, fontWeight: "800" },
  modalScrim: {
    backgroundColor: "rgba(12, 28, 21, 0.45)",
    flex: 1,
    justifyContent: "flex-end",
  },
  modalKeyboard: { justifyContent: "flex-end", maxHeight: "94%" },
  modalSheet: {
    backgroundColor: "#F7F9F6",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    maxHeight: "100%",
    paddingTop: 20,
  },
  modalHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  modalEyebrow: { color: "#28735D", fontSize: 10, fontWeight: "800" },
  modalTitle: {
    color: "#182A24",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 4,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: "#E6ECE7",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  closeText: { color: "#40534A", fontSize: 24, lineHeight: 28 },
  formContent: { paddingHorizontal: 20, paddingBottom: 28 },
  fieldLabel: {
    color: "#35463E",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 7,
    marginTop: 7,
  },
  textInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8E1D9",
    borderRadius: 8,
    borderWidth: 1,
    color: "#182A24",
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginBottom: 5,
  },
  choiceChip: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8E1D9",
    borderRadius: 7,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 11,
  },
  choiceChipSelected: { backgroundColor: "#E5F1E9", borderColor: "#28735D" },
  choiceText: { color: "#58685F", fontSize: 11, fontWeight: "700" },
  choiceTextSelected: { color: "#205540" },
  numberInput: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#D8E1D9",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 48,
    paddingHorizontal: 11,
  },
  numberText: { color: "#182A24", flex: 1, fontSize: 14, paddingVertical: 9 },
  numberUnit: { color: "#718078", fontSize: 10, fontWeight: "700" },
  macroInputs: { flexDirection: "row", gap: 7 },
  formError: { color: "#B42318", fontSize: 12, lineHeight: 17, marginTop: 10 },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#28735D",
    borderRadius: 8,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 50,
  },
  saveButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.58 },
});
