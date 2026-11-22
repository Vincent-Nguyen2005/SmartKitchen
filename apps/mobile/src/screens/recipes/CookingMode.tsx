import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, Vibration, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight, Pause, Play, Plus, X } from "lucide-react-native";
import { AppIcon, colors, fontSize, IconButton, radius, spacing, textStyles, touchTarget, typography } from "../../theme";
import { amountText, clockText, sortedSteps, type Recipe, type RecipeIngredient } from "./recipeTypes";

type TimerState =
  | { status: "idle"; remainingMs: number }
  | { status: "running"; endAt: number }
  | { status: "paused"; remainingMs: number }
  | { status: "done" };

const KEEP_AWAKE_TAG = "smartkitchen-cooking";
const EXTRA_MS = 30_000;
/** A timer that ended longer ago than this (app was in the background) does not vibrate again. */
const LATE_ALERT_MS = 3000;

type NotificationsModule = typeof import("expo-notifications");
/** expo-notifications is loaded lazily (like push registration) so the screen still works where it is missing. */
async function loadNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === "web") return null;
  try {
    return await import("expo-notifications");
  } catch {
    return null;
  }
}

/** Keeps the screen on while cooking when expo-keep-awake is available (it ships with expo). */
async function setKeepAwake(on: boolean): Promise<void> {
  try {
    const keepAwake = await import("expo-keep-awake");
    if (on) await keepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    else await keepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
  } catch {
    // Not available on this platform: the screen may dim as usual.
  }
}

const ingredientText = (ingredient: RecipeIngredient): string =>
  amountText(ingredient) ? `${ingredient.name} · ${amountText(ingredient)}` : ingredient.name;

type Props = {
  recipe: Recipe | null;
  onClose: () => void;
  /** "Hoàn thành" on the last step (the dish is cooked): e.g. count one serving in today's nutrition. */
  onComplete?: (recipe: Recipe) => void;
};

/**
 * Cooking mode: one step at a time with a countdown for timed steps. The timer stores its end time (not a
 * ticking counter), so it stays right after the app goes to the background or the screen locks. When it ends:
 * vibration and an alert in the app, and a local notification (with sound) scheduled for the end time.
 */
export default function CookingMode({ recipe, onClose, onComplete }: Props): React.JSX.Element {
  const steps = recipe ? sortedSteps(recipe) : [];
  const [index, setIndex] = useState(0);
  const [timer, setTimer] = useState<TimerState>({ status: "idle", remainingMs: 0 });
  const [now, setNow] = useState(() => Date.now());
  const notificationId = useRef<string | null>(null);
  const notifications = useRef<NotificationsModule | null>(null);
  const step = steps[index] ?? null;
  const stepMs = (step?.durationSeconds ?? 0) * 1000;
  const hasTimer = step !== null && step.durationSeconds !== null && step.durationSeconds > 0;
  const visible = recipe !== null;

  const cancelNotification = useCallback(() => {
    const id = notificationId.current;
    notificationId.current = null;
    if (id && notifications.current) void notifications.current.cancelScheduledNotificationAsync(id).catch(() => undefined);
  }, []);

  const scheduleNotification = useCallback(async (endAt: number) => {
    cancelNotification();
    const module = notifications.current;
    if (!module || !recipe || !step) return;
    try {
      const permission = await module.getPermissionsAsync();
      const granted = permission.granted || (await module.requestPermissionsAsync()).granted;
      if (!granted) return;
      notificationId.current = await module.scheduleNotificationAsync({
        content: { title: "Hết giờ", body: `${recipe.name} · Bước ${index + 1}: ${step.instruction}`, sound: true },
        trigger: { type: module.SchedulableTriggerInputTypes.DATE, date: new Date(endAt) },
      });
    } catch {
      // No notification (e.g. Expo Go limits): the in-app alert still fires when the app is open.
    }
  }, [cancelNotification, index, recipe, step]);

  // Open / close: keep the screen awake, load notifications, show them with sound while cooking.
  useEffect(() => {
    if (!visible) return undefined;
    setIndex(0);
    void setKeepAwake(true);
    let active = true;
    void loadNotifications().then((module) => {
      if (!active || !module) return;
      notifications.current = module;
      module.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
      });
    });
    return () => {
      active = false;
      void setKeepAwake(false);
      cancelNotification();
      notifications.current?.setNotificationHandler(null);
    };
  }, [visible, cancelNotification]);

  // A new step starts with its full time, not running.
  useEffect(() => {
    cancelNotification();
    setTimer({ status: "idle", remainingMs: stepMs });
  }, [index, recipe?.id, stepMs, cancelNotification]);

  // Re-render a few times a second while running, and right away when the app comes back.
  useEffect(() => {
    if (timer.status !== "running") return undefined;
    const interval = setInterval(() => setNow(Date.now()), 250);
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") setNow(Date.now()); });
    return () => { clearInterval(interval); subscription.remove(); };
  }, [timer.status]);

  // Time is up: alert once (vibration only when the app saw it end; the notification covered the background).
  useEffect(() => {
    if (timer.status !== "running" || now < timer.endAt) return;
    const late = now - timer.endAt > LATE_ALERT_MS;
    notificationId.current = null;
    setTimer({ status: "done" });
    if (!late) Vibration.vibrate([0, 600, 300, 600]);
    if (Platform.OS !== "web" && !late) Alert.alert("Hết giờ", step ? `Bước ${index + 1}: ${step.instruction}` : undefined);
  }, [now, timer, index, step]);

  const start = (remainingMs: number) => {
    const endAt = Date.now() + remainingMs;
    setNow(Date.now());
    setTimer({ status: "running", endAt });
    void scheduleNotification(endAt);
  };
  const pause = () => {
    if (timer.status !== "running") return;
    cancelNotification();
    setTimer({ status: "paused", remainingMs: Math.max(0, timer.endAt - Date.now()) });
  };
  const addThirty = () => {
    if (timer.status === "running") start(Math.max(0, timer.endAt - Date.now()) + EXTRA_MS);
    else if (timer.status === "done") start(EXTRA_MS);
    else setTimer({ ...timer, remainingMs: timer.remainingMs + EXTRA_MS });
  };

  const requestClose = () => {
    if (timer.status !== "running") { onClose(); return; }
    const message = "Hẹn giờ đang chạy. Thoát chế độ nấu và hủy hẹn giờ?";
    if (Platform.OS === "web") {
      if (globalThis.confirm?.(message) ?? true) onClose();
      return;
    }
    Alert.alert("Thoát chế độ nấu?", message, [
      { text: "Ở lại", style: "cancel" },
      { text: "Thoát", style: "destructive", onPress: onClose },
    ]);
  };

  const remainingMs = timer.status === "running" ? Math.max(0, timer.endAt - now) : timer.status === "done" ? 0 : timer.remainingMs;
  const isLast = index >= steps.length - 1;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={requestClose}>
      <SafeAreaView style={local.screen}>
        <View style={local.header}>
          <IconButton icon={X} accessibilityLabel="Thoát chế độ nấu" onPress={requestClose} />
          <View style={local.headerText}>
            <Text style={local.recipeName} numberOfLines={1}>{recipe?.name ?? ""}</Text>
            <Text style={local.progressText}>{steps.length > 0 ? `Bước ${index + 1}/${steps.length}` : "Chưa có các bước"}</Text>
          </View>
        </View>
        <View style={local.progressTrack}>
          <View style={[local.progressFill, { width: `${steps.length > 0 ? ((index + 1) / steps.length) * 100 : 0}%` }]} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={local.body}>
          {step ? (
            <>
              <Text style={local.instruction} accessibilityRole="header">{step.instruction}</Text>
              {step.ingredients.some((ingredient) => !ingredient.isSeasoning) && (
                <View style={local.ingredients}>
                  <Text style={local.sectionLabel}>Cho vào bây giờ</Text>
                  {step.ingredients.filter((ingredient) => !ingredient.isSeasoning).map((ingredient) => (
                    <Text key={ingredient.name} style={local.ingredient}>• {ingredientText(ingredient)}</Text>
                  ))}
                </View>
              )}
              {step.ingredients.some((ingredient) => ingredient.isSeasoning) && (
                <View style={local.ingredients}>
                  <Text style={local.sectionLabel}>Gia vị</Text>
                  {step.ingredients.filter((ingredient) => ingredient.isSeasoning).map((ingredient) => (
                    <Text key={ingredient.name} style={local.ingredient}>• {ingredientText(ingredient)}</Text>
                  ))}
                </View>
              )}

              {hasTimer ? (
                <View style={local.timerBox}>
                  <Text
                    style={[local.clock, timer.status === "done" && local.clockDone]}
                    accessibilityLabel={timer.status === "done" ? "Hết giờ" : `Còn ${clockText(remainingMs / 1000)}`}
                    accessibilityLiveRegion={timer.status === "done" ? "assertive" : "none"}
                  >
                    {clockText(remainingMs / 1000)}
                  </Text>
                  {timer.status === "done" && <Text style={local.doneText}>Hết giờ! Bấm Bước sau để tiếp tục.</Text>}
                  <View style={local.timerControls}>
                    {timer.status === "running" ? (
                      <ControlButton icon={Pause} label="Tạm dừng" onPress={pause} />
                    ) : timer.status === "paused" ? (
                      <ControlButton icon={Play} label="Tiếp tục" onPress={() => start(timer.remainingMs)} />
                    ) : timer.status === "idle" ? (
                      <ControlButton icon={Play} label="Bắt đầu" onPress={() => start(timer.remainingMs)} />
                    ) : null}
                    <ControlButton icon={Plus} label="+30 giây" onPress={addThirty} secondary />
                  </View>
                </View>
              ) : (
                <Text style={local.noTimer}>Làm xong thì bấm Bước sau</Text>
              )}
            </>
          ) : (
            <Text style={local.noTimer}>Món này chưa có các bước nấu.</Text>
          )}
        </ScrollView>

        <View style={local.footer}>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: index === 0 }} disabled={index === 0} onPress={() => setIndex((current) => Math.max(0, current - 1))} style={[local.navButton, local.navSecondary, index === 0 && local.disabled]}>
            <AppIcon icon={ChevronLeft} size="sm" color={colors.primary} />
            <Text style={local.navSecondaryText}>Bước trước</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => {
            if (!isLast) { setIndex((current) => current + 1); return; }
            // Finished: count the dish (when steps exist), then leave without the running-timer question.
            if (recipe && steps.length > 0) onComplete?.(recipe);
            onClose();
          }} style={[local.navButton, local.navPrimary]}>
            <Text style={local.navPrimaryText}>{isLast ? "Hoàn thành" : "Bước sau"}</Text>
            {!isLast && <AppIcon icon={ChevronRight} size="sm" color={colors.primaryText} />}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function ControlButton({ icon, label, onPress, secondary = false }: { icon: typeof Play; label: string; onPress: () => void; secondary?: boolean }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [local.control, secondary ? local.controlSecondary : local.controlPrimary, pressed && local.pressed]}>
      <AppIcon icon={icon} size="md" color={secondary ? colors.primary : colors.primaryText} />
      <Text style={secondary ? local.controlSecondaryText : local.controlPrimaryText}>{label}</Text>
    </Pressable>
  );
}

const local = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  headerText: { flex: 1 },
  recipeName: { ...textStyles.subheading },
  progressText: { ...textStyles.labelSmall, color: colors.primary },
  progressTrack: { backgroundColor: colors.border, height: 4, marginHorizontal: spacing.md, marginTop: spacing.sm, borderRadius: radius.pill, overflow: "hidden" },
  progressFill: { backgroundColor: colors.primary, height: "100%" },
  body: { alignSelf: "center", gap: spacing.lg, maxWidth: 720, padding: spacing.lg, width: "100%" },
  instruction: { ...textStyles.pageTitle, lineHeight: typography.pageTitle.lineHeight },
  sectionLabel: { ...textStyles.labelSmall, color: colors.muted },
  ingredients: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs, padding: spacing.md },
  ingredient: { ...textStyles.body },
  timerBox: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  clock: { ...textStyles.pageTitle, color: colors.primary, fontSize: fontSize.headline * 3, fontVariant: ["tabular-nums"], lineHeight: fontSize.headline * 3.4 },
  clockDone: { color: colors.danger },
  doneText: { ...textStyles.label, color: colors.danger, textAlign: "center" },
  timerControls: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "center" },
  control: { alignItems: "center", borderRadius: radius.sm, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: touchTarget + 8, minWidth: 140, paddingHorizontal: spacing.lg },
  controlPrimary: { backgroundColor: colors.primary },
  controlSecondary: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 1 },
  controlPrimaryText: { ...textStyles.label, color: colors.primaryText },
  controlSecondaryText: { ...textStyles.label, color: colors.primary },
  pressed: { opacity: 0.8 },
  noTimer: { ...textStyles.body, color: colors.muted, textAlign: "center" },
  footer: { borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  navButton: { alignItems: "center", borderRadius: radius.sm, flex: 1, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: touchTarget + 4 },
  navPrimary: { backgroundColor: colors.primary },
  navSecondary: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 1 },
  navPrimaryText: { ...textStyles.label, color: colors.primaryText },
  navSecondaryText: { ...textStyles.label, color: colors.primary },
  disabled: { opacity: 0.5 },
});
