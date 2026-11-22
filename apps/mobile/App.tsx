import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  Bell,
  CalendarDays,
  ChefHat,
  HeartPulse,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  LogOut,
  Mic,
  Salad,
  QrCode,
  Settings,
  ShoppingBasket,
  Utensils,
  Users,
  X,
} from "lucide-react-native";
import { AppIcon, breakpoints, colors, IconButton, spacing, textStyles, touchTarget } from "./src/theme";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import LoginScreen from "./src/screens/auth/LoginScreen";
import ForgotPasswordScreen from "./src/screens/auth/ForgotPasswordScreen";
import OtpVerificationScreen from "./src/screens/auth/OtpVerificationScreen";
import RegisterScreen from "./src/screens/auth/RegisterScreen";
import FamilyScreenFlow from "./src/screens/family/FamilyScreenFlow";
import InventoryScreen from "./src/screens/inventory/InventoryListScreen";
import InventoryCapturePanel, { type InventoryCaptureMode } from "./src/screens/inventory/InventoryCapturePanel";
import ReceiptQrCapturePanel from "./src/screens/inventory/ReceiptQrCapturePanel";
import { CaptureDialog, MIC_PERMISSION_TEXT, useInstantVoice } from "./src/screens/inventory/InstantCapture";
import { CAMERA_PERMISSION_TEXT, takeItemPhoto } from "./src/screens/inventory/inventoryPhoto";
import type { UploadPhoto } from "./src/screens/inventory/inventoryApi";
import ShoppingCartScreen from "./src/screens/shopping-cart/ShoppingCartScreen";
import NutritionHome from "./src/screens/nutrition/NutritionHome";
import { SessionProvider, useSession } from "./src/services/session";
import NotificationsHome from "./src/screens/notifications/NotificationsHome";
import AdminHome from "./src/screens/admin/AdminHome";
import MenuScreen from "./src/screens/menu/MenuScreen";
import RecipeScreen from "./src/screens/recipes/RecipeScreen";
import PaymentScreen, { type PaymentResult } from "./src/screens/payment/PaymentScreen";
import { createGatewayClient } from "./src/screens/notifications/gatewayApi";
import NotificationPreferencesScreen from "./src/screens/notifications/NotificationPreferencesScreen";
import MealSizeSettings from "./src/screens/menu/MealSizeSettings";
import NutritionProfileScreen from "./src/screens/nutrition/NutritionProfileScreen";
import { EXPIRY_ALERT_DAYS } from "./src/screens/notifications/NotificationFeed";
import { inventoryApi } from "./src/screens/inventory/inventoryApi";
import { registerDeviceToken } from "./src/screens/notifications/registerDeviceToken";

type Tab =
  | "inventory"
  | "shopping"
  | "menu"
  | "recipes"
  | "nutrition"
  | "family"
  | "notifications"
  | "admin";
type AuthView = "login" | "register" | "otp" | "forgot";
const tabs = [
  { key: "inventory", label: "Kho", icon: Archive },
  { key: "shopping", label: "Đi chợ", icon: ShoppingBasket },
  { key: "menu", label: "Lịch", icon: CalendarDays },
  { key: "recipes", label: "Nấu ăn", icon: ChefHat },
  { key: "family", label: "Gia đình", icon: Users },
  { key: "nutrition", label: "Dinh dưỡng", icon: Salad },
  { key: "notifications", label: "Thông báo", icon: Bell },
  { key: "admin", label: "Quản trị", icon: Settings },
] as const;
const memberNavigationKeys: ReadonlySet<Tab> = new Set(["inventory", "shopping", "menu", "family", "notifications"]);

/**
 * Phone-first look on web too: hide the browser scrollbars (scrolling still works). Applied once at the app root;
 * every ScrollView / FlatList also sets showsVertical/HorizontalScrollIndicator={false} for native.
 */
type WebDocument = { getElementById: (id: string) => unknown; createElement: (tag: string) => { id: string; textContent: string }; head: { appendChild: (node: unknown) => void } };
const webDocument = Platform.OS === "web" ? (globalThis as { document?: WebDocument }).document : undefined;
if (webDocument && !webDocument.getElementById("smartkitchen-hide-scrollbars")) {
  const style = webDocument.createElement("style");
  style.id = "smartkitchen-hide-scrollbars";
  style.textContent = "* { scrollbar-width: none; -ms-overflow-style: none; } *::-webkit-scrollbar { display: none; width: 0; height: 0; }";
  webDocument.head.appendChild(style);
}
const menuKeys: ReadonlySet<Tab> = new Set(["menu", "recipes", "nutrition"]);
const memberTabs = tabs.filter(({ key }) => memberNavigationKeys.has(key));
const menuTabs = tabs.filter(({ key }) => menuKeys.has(key));
const captureActions = [
  { key: "photo", label: "Chụp ảnh", icon: Camera },
  { key: "scan", label: "QR hóa đơn", icon: QrCode },
  { key: "voice", label: "Giọng nói", icon: Mic },
] as const;

// Logic lấy API và User ID của Hùng
function NoticeBanner({ message }: { message: string }): React.JSX.Element {
  const { width } = useWindowDimensions();
  return (
    <View pointerEvents="none" style={styles.authNoticeContainer}>
      <Text accessibilityRole="alert" style={[styles.authNotice, { maxWidth: Math.min(480, width - spacing.md * 2) }]}>{message}</Text>
    </View>
  );
}

export function resolveNutritionUserId(
  sessionUserId?: string | null,
): string | undefined {
  const userId =
    sessionUserId?.trim() || process.env.EXPO_PUBLIC_USER_ID?.trim();
  return userId || undefined;
}

function AppContent(): React.JSX.Element {
  const session = useSession();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("inventory");
  const [authView, setAuthView] = useState<AuthView>("login");
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  // Hồ sơ > "Cài đặt thông báo" (the notification settings screen, unchanged, moved out of Thông báo).
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);
  // Hồ sơ > "Số món mỗi bữa" (dishes per meal for new menus, stored in menu-service).
  const [mealSizeOpen, setMealSizeOpen] = useState(false);
  // Hồ sơ > "Thông tin sức khỏe" (the nutrition profile form, moved out of Dinh dưỡng); closing it reloads targets.
  const [healthProfileOpen, setHealthProfileOpen] = useState(false);
  const [nutritionRefreshKey, setNutritionRefreshKey] = useState(0);
  const closeHealthProfile = () => { setHealthProfileOpen(false); setNutritionRefreshKey((key) => key + 1); };
  // Thông báo expiry alert tapped: Kho opens that item's edit dialog.
  const [inventoryFocusId, setInventoryFocusId] = useState<string | null>(null);
  // Thông báo tab badge = unread notifications + current expiry alerts.
  const [notificationBadge, setNotificationBadge] = useState(0);
  const badgeRunning = useRef(false);
  const badgePending = useRef(false);
  const [captureMode, setCaptureMode] = useState<InventoryCaptureMode | null>(null);
  const [captureReady, setCaptureReady] = useState(false);
  // Result of the bottom-bar camera / microphone, handed to the capture panel when its sheet opens.
  const [capturePhoto, setCapturePhoto] = useState<UploadPhoto | null>(null);
  const [captureVoiceText, setCaptureVoiceText] = useState<string | undefined>(undefined);
  const [captureDialog, setCaptureDialog] = useState<{ text: string; settings: boolean } | null>(null);
  const voice = useInstantVoice({
    onTranscript: (text) => { setCaptureVoiceText(text); setCaptureReady(false); setCaptureMode("voice"); },
    onPermissionDenied: () => setCaptureDialog({ text: MIC_PERMISSION_TEXT, settings: true }),
    onMessage: (text) => setCaptureDialog({ text, settings: false }),
  });
  const closeCapture = () => { setCaptureReady(false); setCaptureMode(null); setCapturePhoto(null); setCaptureVoiceText(undefined); };

  /**
   * Bottom bar. "Chụp ảnh": the phone camera opens in this tap (web: the camera file input is clicked synchronously
   * inside it); after the shot the Kho photo form opens. "Giọng nói": listening starts in this tap with a small
   * overlay. Without a family the sheet opens instead, to explain why nothing can be saved.
   */
  const startCapture = (key: InventoryCaptureMode) => {
    if (key === "scan" || !session.family?.id || !session.accessToken) { setCaptureReady(false); setCaptureMode(key); return; }
    if (key === "voice") { voice.start(); return; }
    void takeItemPhoto().then((result) => {
      if (result.status === "picked") { setCapturePhoto(result.photo); setCaptureReady(false); setCaptureMode("photo"); }
      else if (result.status === "denied") setCaptureDialog({ text: CAMERA_PERMISSION_TEXT, settings: true });
      else if (result.status === "error") setCaptureDialog({ text: result.message, settings: false });
    });
  };
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const [otpInitialCooldown, setOtpInitialCooldown] = useState(60);
  const sessionUserId = session.user?.id;
  const userId = resolveNutritionUserId(sessionUserId);
  const isAdmin = session.user?.role === "ADMIN";
  // SCRUM-283: ADMIN accounts see only the admin tab; everyone else sees every tab except admin.
  const visibleTabs = tabs.filter(({ key }) => (key === "admin") === isAdmin);
  // Derived (not synced in an effect) so no other tab renders for a frame after the role changes.
  const activeTab: Tab = isAdmin ? "admin" : tab === "admin" ? "inventory" : tab;
  const memberTabWidth = width >= breakpoints.wide ? Math.min(140, width / 6) : "16.666667%";
  const selectedMenuTab = menuTabs.find(({ key }) => key === activeTab) ?? menuTabs[0];
  const showCaptureBar = !isAdmin && activeTab !== "notifications" && !profileOpen && !paymentUrl;

  /** Unread notifications (status SENT, as the old "Chưa đọc" filter) + expiry alerts; one request at a time. */
  const refreshNotificationBadge = useCallback(async (): Promise<void> => {
    const token = session.accessToken;
    if (isAdmin || !token) { setNotificationBadge(0); return; }
    if (badgeRunning.current) { badgePending.current = true; return; }
    badgeRunning.current = true;
    try {
      const [unread, expiring] = await Promise.allSettled([
        createGatewayClient(token).get<{ total?: number }>("/api/notifications/notifications?status=SENT&limit=1"),
        session.family?.id ? inventoryApi.expiring(token, session.family.id, EXPIRY_ALERT_DAYS) : Promise.resolve(null),
      ]);
      const unreadCount = unread.status === "fulfilled" ? unread.value.total ?? 0 : 0;
      const expiryCount = expiring.status === "fulfilled" ? expiring.value?.items.length ?? 0 : 0;
      setNotificationBadge(unreadCount + expiryCount);
    } finally {
      badgeRunning.current = false;
      if (badgePending.current) { badgePending.current = false; void refreshNotificationBadge(); }
    }
  }, [isAdmin, session.accessToken, session.family?.id]);

  // On sign-in, tab changes and every minute while the app is in the foreground.
  useEffect(() => { void refreshNotificationBadge(); }, [refreshNotificationBadge, activeTab]);
  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === "active") void refreshNotificationBadge(); }, 60_000);
    const subscription = AppState.addEventListener("change", (next) => { if (next === "active") void refreshNotificationBadge(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [refreshNotificationBadge]);
  const availableWidth = width - insets.left - insets.right;
  const menuTabPixelWidth = width >= breakpoints.wide ? Math.min(140, width / 6) : availableWidth / 6;
  const dropdownWidth = Math.min(220, availableWidth - spacing.sm * 2);
  const dropdownLeft = insets.left + Math.min(
    (availableWidth - menuTabPixelWidth * 6) / 2 + menuTabPixelWidth * 2,
    availableWidth - dropdownWidth - spacing.sm,
  );
  const dropdownTop = insets.top + touchTarget + spacing.xl + spacing.sm + 1;

  // Register this device's Expo push token once per signed-in user; fails silently (Huy, #61).
  useEffect(() => {
    if (!session.user || !session.accessToken) return;
    void registerDeviceToken(createGatewayClient(session.accessToken));
  }, [session.user?.id, session.accessToken]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    if (Platform.OS === "web") {
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") setMenuOpen(false);
      };
      window.addEventListener("keydown", closeOnEscape);
      return () => window.removeEventListener("keydown", closeOnEscape);
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setMenuOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [menuOpen]);

  const withNotice = (screen: React.JSX.Element): React.JSX.Element => (
    <View style={styles.container}>
      {screen}
      {!!notice && <NoticeBanner message={notice} />}
    </View>
  );

  if (!session.ready) {
    return (
      <SafeAreaView style={styles.loading as any}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (session.restoreError) {
    return (
      <SafeAreaView style={styles.restoreError}>
        <Text style={styles.noticeTitle}>
          Không thể khôi phục phiên đăng nhập
        </Text>
        <Text style={styles.noticeMessage}>
          Vui lòng kiểm tra kết nối mạng và thử lại. Bạn không cần đăng nhập
          lại.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={session.retryRestore}
          style={styles.retryButton}
        >
          <Text style={styles.retryText}>Thử lại</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!session.user) {
    if (authView === "otp" && session.pendingVerificationEmail) {
      return withNotice(
        <OtpVerificationScreen
          email={session.pendingVerificationEmail}
          initialCooldownSeconds={otpInitialCooldown}
          onVerify={async (code) => {
            await session.verifyOtp(code);
            setNotice("Xác minh thành công. Bạn đã đăng nhập.");
          }}
          onResend={async () => {
            await session.resendOtp();
            setNotice("Đã gửi mã mới.");
          }}
          onBack={() => { setNotice(null); setAuthView("register"); }}
        />
      );
    }
    if (authView === "forgot") {
      return withNotice(<ForgotPasswordScreen onBack={() => setAuthView("login")} onSuccess={() => {
        setNotice("Đổi mật khẩu thành công. Vui lòng đăng nhập lại.");
        setAuthView("login");
      }} />);
    }
    if (authView === "register") {
      return withNotice(
        <RegisterScreen
          navigation={{ navigate: () => setAuthView("login") }}
          onSubmit={async (fullName, email, password) => {
            const result = await session.register(fullName, email, password);
            setOtpInitialCooldown(result.retryAfterSeconds);
            setNotice(result.otpSent ? null : "Mã cũ vẫn dùng được. Chờ để gửi mã mới.");
            setAuthView("otp");
          }}
        />
      );
    }
    return withNotice(
      <LoginScreen
        navigation={{
          navigate: () => { setNotice(null); setAuthView("register"); },
        }}
        onSubmit={async (email, password) => {
          await session.signIn(email, password);
          setNotice("Đăng nhập thành công.");
        }}
        onForgotPassword={() => { setNotice(null); setAuthView("forgot"); }}
        onVerificationRequired={() => {
          setOtpInitialCooldown(0);
          setNotice("Chưa xác minh email. Gửi lại mã nếu cần.");
          setAuthView("otp");
        }}
      />
    );
  }

  const signOut = () => {
    setCaptureMode(null);
    setCaptureReady(false);
    void session.signOut();
  };
  const renderTab = ({ key, label, icon: Icon }: (typeof tabs)[number]) => {
    const active = activeTab === key;
    return (
      <TouchableOpacity
        accessibilityLabel={label}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        key={key}
        style={[styles.tab, { width: width >= breakpoints.wide ? 140 : 88 }, active && styles.tabActive]}
        onPress={() => setTab(key)}
      >
        <AppIcon icon={Icon} size="md" color={active ? colors.primary : colors.muted} />
        <Text numberOfLines={2} style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {isAdmin ? (
        <View style={[styles.tabBar, styles.adminTabRow]}>
          {visibleTabs.map(renderTab)}
          <IconButton icon={LogOut} size="md" color={colors.text} accessibilityLabel="Đăng xuất" onPress={signOut} />
        </View>
      ) : (
        <View style={[styles.tabBar, styles.memberTabRow]}>
          {memberTabs.map(({ key, label, icon: Icon }) => {
            const active = menuKeys.has(key) ? menuKeys.has(activeTab) : activeTab === key;
            const displayedTab = key === "menu" ? selectedMenuTab : { label, icon: Icon };
            const DisplayedIcon = displayedTab.icon;
            return (
              <TouchableOpacity
                accessibilityLabel={key === "menu" ? `Mở danh mục ${displayedTab.label}` : key === "notifications" && notificationBadge > 0 ? `${label}, ${notificationBadge} mục mới` : label}
                accessibilityRole={key === "menu" ? "button" : "tab"}
                accessibilityState={key === "menu" ? { expanded: menuOpen } : { selected: active }}
                key={key}
                onPress={() => { if (key === "menu") setMenuOpen((open) => !open); else setTab(key); }}
                style={[styles.tab, { width: memberTabWidth }, active && styles.tabActive]}
              >
                {key === "menu" ? (
                  <View style={styles.menuTabIcons}>
                    <AppIcon icon={DisplayedIcon} size="md" color={active ? colors.primary : colors.muted} />
                    <AppIcon icon={ChevronDown} size="sm" color={active ? colors.primary : colors.muted} />
                  </View>
                ) : (
                  <View>
                    <AppIcon icon={DisplayedIcon} size="md" color={active ? colors.primary : colors.muted} />
                    {key === "notifications" && notificationBadge > 0 && (
                      <View style={styles.tabBadge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                        <Text style={styles.tabBadgeText}>{notificationBadge > 99 ? "99+" : notificationBadge}</Text>
                      </View>
                    )}
                  </View>
                )}
                <Text numberOfLines={2} style={[styles.tabText, active && styles.tabTextActive]}>{displayedTab.label}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            accessibilityLabel="Hồ sơ người dùng"
            accessibilityRole="button"
            accessibilityState={{ expanded: profileOpen }}
            onPress={() => setProfileOpen(true)}
            style={[styles.tab, { width: memberTabWidth }]}
          >
            <AppIcon icon={CircleUserRound} size="md" color={colors.muted} />
            <Text style={styles.tabText}>Hồ sơ</Text>
          </TouchableOpacity>
        </View>
      )}
      {!!notice && <NoticeBanner message={notice} />}

      {menuOpen && !isAdmin && (
        <View style={styles.menuDropdownLayer}>
          <Pressable accessibilityLabel="Đóng danh mục thực đơn" accessibilityRole="button" onPress={() => setMenuOpen(false)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={[styles.menuDropdown, {
            left: dropdownLeft,
            top: dropdownTop,
            width: dropdownWidth,
            maxHeight: Math.max(0, height - dropdownTop - insets.bottom - spacing.sm),
          }]}>
            {menuTabs.map(({ key, label, icon: Icon }) => {
              const selected = activeTab === key;
              return (
                <TouchableOpacity accessibilityLabel={label} accessibilityRole="button" key={key}
                  accessibilityState={{ selected }}
                  onPress={() => { setTab(key); setMenuOpen(false); }}
                  style={[styles.menuDropdownItem, selected && styles.menuDropdownItemActive]}>
                  <AppIcon icon={Icon} size="md" color={selected ? colors.primary : colors.muted} />
                  <Text style={[styles.sheetItemText, selected && styles.sheetItemTextActive]}>{label}</Text>
                  {selected && <AppIcon icon={Check} size="sm" color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <Modal transparent animationType="fade" visible={profileOpen && !isAdmin} onRequestClose={() => setProfileOpen(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable accessibilityLabel="Đóng hồ sơ" accessibilityRole="button" onPress={() => setProfileOpen(false)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={styles.sheetPanel}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Hồ sơ người dùng</Text>
              <TouchableOpacity accessibilityLabel="Đóng" accessibilityRole="button" onPress={() => setProfileOpen(false)} style={styles.sheetClose}>
                <AppIcon icon={X} size="md" />
              </TouchableOpacity>
            </View>
            <Text style={styles.profileLabel}>Họ tên</Text>
            <Text style={styles.profileValue}>{session.user.fullName?.trim() || "Chưa cập nhật"}</Text>
            <Text style={styles.profileLabel}>Email</Text>
            <Text style={styles.profileValue}>{session.user.email}</Text>
            <Text style={styles.profileLabel}>Vai trò trong gia đình</Text>
            <Text style={styles.profileValue}>{session.family?.currentUserRole === "OWNER" ? "Chủ gia đình" : session.family?.currentUserRole === "ADMIN" ? "Quản trị viên" : session.family?.currentUserRole === "MEMBER" ? "Thành viên" : "Chưa tham gia gia đình"}</Text>
            <TouchableOpacity accessibilityLabel="Cài đặt thông báo" accessibilityRole="button"
              onPress={() => { setProfileOpen(false); setNotificationSettingsOpen(true); }} style={styles.sheetItem}>
              <AppIcon icon={Bell} size="md" color={colors.primary} />
              <Text style={styles.sheetItemText}>Cài đặt thông báo</Text>
              <AppIcon icon={ChevronRight} size="sm" color={colors.muted} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityLabel="Thông tin sức khỏe" accessibilityRole="button"
              onPress={() => { setProfileOpen(false); setHealthProfileOpen(true); }} style={styles.sheetItem}>
              <AppIcon icon={HeartPulse} size="md" color={colors.primary} />
              <Text style={styles.sheetItemText}>Thông tin sức khỏe</Text>
              <AppIcon icon={ChevronRight} size="sm" color={colors.muted} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityLabel="Số món mỗi bữa" accessibilityRole="button"
              onPress={() => { setProfileOpen(false); setMealSizeOpen(true); }} style={styles.sheetItem}>
              <AppIcon icon={Utensils} size="md" color={colors.primary} />
              <Text style={styles.sheetItemText}>Số món mỗi bữa</Text>
              <AppIcon icon={ChevronRight} size="sm" color={colors.muted} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityLabel="Đăng xuất" accessibilityRole="button"
              onPress={() => { setProfileOpen(false); signOut(); }} style={styles.sheetItem}>
              <AppIcon icon={LogOut} size="md" color={colors.danger} />
              <Text style={styles.sheetSignOutText}>Đăng xuất</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" visible={notificationSettingsOpen && !isAdmin} onRequestClose={() => setNotificationSettingsOpen(false)}>
        <SafeAreaView style={styles.settingsScreen}>
          <View style={styles.settingsHeader}>
            <IconButton icon={ChevronLeft} accessibilityLabel="Quay lại" color={colors.text} onPress={() => setNotificationSettingsOpen(false)} />
            <Text style={styles.settingsTitle}>Cài đặt thông báo</Text>
          </View>
          <View style={styles.settingsBody}>
            <NotificationPreferencesScreen />
          </View>
        </SafeAreaView>
      </Modal>

      <Modal animationType="slide" visible={healthProfileOpen && !isAdmin} onRequestClose={closeHealthProfile}>
        <SafeAreaView style={styles.settingsScreen}>
          <View style={styles.settingsHeader}>
            <IconButton icon={ChevronLeft} accessibilityLabel="Quay lại" color={colors.text} onPress={closeHealthProfile} />
            <Text style={styles.settingsTitle}>Thông tin sức khỏe</Text>
          </View>
          <View style={styles.healthBody}>
            <NutritionProfileScreen />
          </View>
        </SafeAreaView>
      </Modal>

      <Modal animationType="slide" visible={mealSizeOpen && !isAdmin} onRequestClose={() => setMealSizeOpen(false)}>
        <SafeAreaView style={styles.settingsScreen}>
          <View style={styles.settingsHeader}>
            <IconButton icon={ChevronLeft} accessibilityLabel="Quay lại" color={colors.text} onPress={() => setMealSizeOpen(false)} />
            <Text style={styles.settingsTitle}>Số món mỗi bữa</Text>
          </View>
          <View style={styles.settingsBody}>
            <MealSizeSettings />
          </View>
        </SafeAreaView>
      </Modal>

      <Modal animationType="fade" visible={captureMode === "scan" && !isAdmin} onRequestClose={() => setCaptureMode(null)}>
        <ReceiptQrCapturePanel
          familyId={session.family?.id ?? null}
          accessToken={session.accessToken}
          onSaved={() => setInventoryRefreshKey((current) => current + 1)}
          onClose={() => setCaptureMode(null)}
        />
      </Modal>

      <Modal transparent animationType="slide" visible={captureMode !== null && captureMode !== "scan" && !isAdmin} onShow={() => setCaptureReady(true)} onRequestClose={closeCapture}>
        <KeyboardAvoidingView style={styles.captureOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable accessibilityLabel="Đóng chức năng" accessibilityRole="button" onPress={closeCapture} style={StyleSheet.absoluteFill} />
          <View style={styles.captureSheet}>
            <View style={styles.captureHeader}>
              <Text style={styles.captureTitle}>{captureMode === "voice" ? "Thêm bằng giọng nói" : "Chụp ảnh sản phẩm"}</Text>
              <TouchableOpacity accessibilityLabel="Đóng" accessibilityRole="button" onPress={closeCapture} style={styles.sheetClose}>
                <AppIcon icon={X} size="md" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={styles.captureScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}>
              {captureMode !== "scan" && captureMode && (
                <InventoryCapturePanel
                  key={captureMode}
                  initialMode={captureMode}
                  embedded
                  autoStart={captureReady}
                  familyId={session.family?.id ?? null}
                  accessToken={session.accessToken}
                  onSaved={() => setInventoryRefreshKey((current) => current + 1)}
                  onClose={closeCapture}
                  initialPhoto={captureMode === "photo" ? capturePhoto : null}
                  initialVoiceText={captureMode === "voice" ? captureVoiceText : undefined}
                />
              )}
              {!session.family?.id && (
                <TouchableOpacity accessibilityRole="button" onPress={() => { setCaptureReady(false); setCaptureMode(null); setTab("family"); }} style={styles.captureFamilyButton}>
                  <Text style={styles.captureFamilyText}>Đến Gia đình</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Nội dung hiển thị theo Tab */}
      <View style={styles.content}>
        {paymentUrl ? (
          <PaymentScreen
            url={paymentUrl}
            onClose={() => setPaymentUrl(null)}
            onComplete={(_result: PaymentResult) => {
              setPaymentUrl(null);
              setTab("inventory");
            }}
          />
        ) : null}
        {!paymentUrl && activeTab === "inventory" && (
          <InventoryScreen onOpenFamily={() => setTab("family")} refreshKey={inventoryRefreshKey} focusItemId={inventoryFocusId} onFocusHandled={() => setInventoryFocusId(null)} />
        )}
        {!paymentUrl && activeTab === "recipes" && (
          <RecipeScreen accessToken={session.accessToken} />
        )}
        {!paymentUrl && activeTab === "shopping" && <ShoppingCartScreen onOpenFamily={() => setTab("family")} />}
        {!paymentUrl && activeTab === "menu" && (
          <MenuScreen
            accessToken={session.accessToken}
            familyId={session.family?.id}
          />
        )}
        {!paymentUrl && activeTab === "family" && <FamilyScreenFlow />}
        {!paymentUrl && activeTab === "notifications" && (
          <NotificationsHome
            onOpenInventoryItem={(itemId) => { setInventoryFocusId(itemId); setTab("inventory"); }}
            onChanged={() => void refreshNotificationBadge()}
          />
        )}
        {!paymentUrl && activeTab === "admin" && isAdmin && <AdminHome />}
        {/* Hồ sơ / Nhật ký / Thống kê / Gợi ý; never for ADMIN accounts (they only see Quản trị). */}
        {!paymentUrl && activeTab === "nutrition" && !isAdmin && (
          <NutritionHome refreshKey={nutritionRefreshKey} />
        )}
      </View>
      {showCaptureBar && (
        <View style={styles.captureBar}>
          {captureActions.map(({ key, label, icon: Icon }) => (
            <TouchableOpacity key={key} accessibilityLabel={label} accessibilityRole="button"
              onPress={() => startCapture(key)} style={styles.captureAction}>
              <View style={[styles.captureActionIcon, key === "scan" && styles.captureActionIconPrimary]}>
                <AppIcon icon={Icon} size="md" color={key === "scan" ? colors.surface : colors.primary} />
              </View>
              <Text numberOfLines={2} style={styles.captureActionLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {voice.overlay}
      <CaptureDialog text={captureDialog?.text ?? null} settings={captureDialog?.settings} onClose={() => setCaptureDialog(null)} />
    </SafeAreaView>
  );
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <AppContent />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  authNoticeContainer: {
    position: "absolute",
    top: touchTarget + spacing.xl + spacing.sm * 2,
    left: spacing.md,
    right: spacing.md,
    zIndex: 20,
    alignItems: "flex-end",
  },
  authNotice: {
    ...textStyles.bodySmall,
    backgroundColor: "#E8F4EE",
    borderColor: colors.primary,
    borderRadius: 12,
    borderWidth: 1,
    color: "#20594F",
    overflow: "hidden",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlign: "left",
  },
  loading: { alignItems: "center", flex: 1, justifyContent: "center" },
  container: { flex: 1, backgroundColor: colors.background },
  tabBar: {
    borderBottomWidth: 1 as number,
    borderBottomColor: colors.border,
    flexGrow: 0,
  },
  adminTabRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingRight: spacing.sm,
  },
  memberTabRow: { flexDirection: "row", justifyContent: "center" },
  tab: {
    alignItems: "center",
    gap: spacing.xs,
    height: touchTarget + spacing.xl + spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
  },
  tabActive: {
    backgroundColor: colors.surface,
    borderBottomWidth: 3,
    borderBottomColor: colors.primary,
  },
  tabText: {
    ...textStyles.labelSmall,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  tabTextActive: { color: colors.primary },
  tabBadge: { alignItems: "center", backgroundColor: colors.danger, borderColor: colors.surface, borderRadius: 9, borderWidth: 1, justifyContent: "center", minWidth: 18, paddingHorizontal: 3, position: "absolute", right: -10, top: -6 },
  tabBadgeText: { ...textStyles.caption, color: colors.surface, fontWeight: "700", lineHeight: 14 },
  settingsScreen: { backgroundColor: colors.background, flex: 1 },
  settingsHeader: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  settingsTitle: { ...textStyles.heading },
  healthBody: { flex: 1 },
  settingsBody: { flex: 1, paddingTop: spacing.md },
  menuTabIcons: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  sheetOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
  sheetPanel: {
    alignSelf: "center",
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxWidth: 440,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    width: "100%",
  },
  sheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  menuDropdownLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 30, elevation: 30 },
  menuDropdown: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 8,
    padding: spacing.xs,
    position: "absolute",
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  menuDropdownItem: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  menuDropdownItemActive: { backgroundColor: colors.primarySoft },
  sheetTitle: { ...textStyles.subheading, flex: 1 },
  sheetClose: { alignItems: "center", justifyContent: "center", minHeight: touchTarget, minWidth: touchTarget },
  sheetItem: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: touchTarget, paddingHorizontal: spacing.sm },
  sheetItemText: { ...textStyles.body, color: colors.text, flex: 1 },
  sheetItemTextActive: { color: colors.primary, fontWeight: "700" },
  sheetSignOutText: { ...textStyles.body, color: colors.danger },
  profileLabel: { ...textStyles.caption, marginTop: spacing.sm },
  profileValue: { ...textStyles.body, marginBottom: spacing.xs },
  content: { flex: 1 },
  captureBar: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  captureAction: { alignItems: "center", flex: 1, gap: spacing.xs, justifyContent: "center", minHeight: 72, paddingHorizontal: spacing.xs },
  captureActionIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 24, height: 40, justifyContent: "center", width: 40 },
  captureActionIconPrimary: { backgroundColor: colors.primary, height: 48, width: 48 },
  captureActionLabel: { ...textStyles.labelSmall, color: colors.text, fontSize: 12, lineHeight: 15, textAlign: "center" },
  captureOverlay: { backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" },
  captureSheet: { alignSelf: "center", backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "86%", maxWidth: 760, width: "100%" },
  captureHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  captureTitle: { ...textStyles.subheading, color: colors.text },
  captureScroll: { flexShrink: 1 },
  captureFamilyButton: { alignItems: "center", alignSelf: "center", backgroundColor: colors.primary, borderRadius: 10, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.xl },
  captureFamilyText: { ...textStyles.label, color: colors.surface },
  restoreError: {
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  retryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: "center",
    marginTop: spacing.lg,
    minHeight: touchTarget,
    paddingHorizontal: spacing.xl,
  },
  retryText: { ...textStyles.label, color: colors.surface },

  // Styles cho phần thông báo thiếu user của Hùng
  center: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  noticeTitle: { ...textStyles.heading, color: colors.text },
  noticeMessage: {
    ...textStyles.bodySmall,
    color: colors.muted,
    marginTop: spacing.sm,
  },
});
