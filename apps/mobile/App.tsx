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
  Salad,
  QrCode,
  Wallet,
  Settings,
  Trash2,
  ShoppingBasket,
  Users,
  X,
} from "lucide-react-native";
import { AppIcon, breakpoints, colors, IconButton, spacing, textStyles, touchTarget, type LucideIcon } from "./src/theme";
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
import FamilyQrSheet from "./src/screens/family/FamilyQrSheet";
import FamilyQrScanner from "./src/screens/family/FamilyQrScanner";
import { familyQrAction, type FamilyQrAction } from "./src/screens/family/familyQr";
import { familyRoleLabel } from "./src/screens/family/familyActions";
import { CaptureDialog } from "./src/screens/inventory/InstantCapture";
import SpendingScreen from "./src/screens/spending/SpendingScreen";
import { CAMERA_PERMISSION_TEXT, takeItemPhoto } from "./src/screens/inventory/inventoryPhoto";
import type { UploadPhoto } from "./src/screens/inventory/inventoryApi";
import ShoppingCartScreen from "./src/screens/shopping-cart/ShoppingCartScreen";
import NutritionHome from "./src/screens/nutrition/NutritionHome";
import { SessionProvider, useSession } from "./src/services/session";
import NotificationsHome from "./src/screens/notifications/NotificationsHome";
import { pushTarget, type GreetingMeal } from "./src/screens/notifications/pushTarget";
import { expiryDismissKey, orderTarget, visibleExpiryAlerts } from "./src/screens/notifications/feedSelection";
import { notificationSelectionBar, useNotificationSelectionBar } from "./src/screens/notifications/selectionStore";
import AdminHome from "./src/screens/admin/AdminHome";
import MenuScreen from "./src/screens/menu/MenuScreen";
import RecipeScreen from "./src/screens/recipes/RecipeScreen";
import PaymentScreen, { type PaymentResult } from "./src/screens/payment/PaymentScreen";
import { createGatewayClient } from "./src/screens/notifications/gatewayApi";
import NutritionProfileScreen, { type NutritionProfileHandle } from "./src/screens/nutrition/NutritionProfileScreen";
import OnboardingWizard from "./src/screens/nutrition/OnboardingWizard";
import ShipperHome from "./src/screens/shipper/ShipperHome";
import { appShellFor, showsOnboarding } from "./src/navigation/appShell";
import { EXPIRY_ALERT_DAYS } from "./src/screens/notifications/NotificationFeed";
import { shouldRefreshBadge } from "./src/screens/notifications/liveRefresh";
import { inventoryApi } from "./src/screens/inventory/inventoryApi";
import { registerDeviceToken } from "./src/screens/notifications/registerDeviceToken";
import ProfileHeader from "./src/screens/profile/ProfileHeader";
import { closeProfileSub, openProfileSub, PROFILE_CLOSED, profileBack, type ProfileNav } from "./src/screens/profile/profileNav";
import { CAPTURE_ACTIONS, captureBarVisible, type CaptureActionKey } from "./src/navigation/captureBar";
import { SelectionBar } from "./src/components/SelectionBar";
import { topTabStyles } from "./src/components/TopTab";
import { CaptureBar } from "./src/components/CaptureBar";
import { marketSelectionBar, useMarketSelectionBar } from "./src/screens/shopping-cart/selectionBar";

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
/**
 * Text inputs on web: no browser focus outline (the orange/yellow ring); focus shows as the theme primary border on
 * the input or, for a borderless input inside a bordered field, on that field. Applies to every TextInput app-wide.
 */
if (webDocument && !webDocument.getElementById("smartkitchen-input-focus")) {
  const style = webDocument.createElement("style");
  style.id = "smartkitchen-input-focus";
  style.textContent = [
    "input, textarea { outline: none !important; }",
    `input:focus, textarea:focus, *:has(> input:focus), *:has(> textarea:focus) { border-color: ${colors.primary} !important; }`,
  ].join(" ");
  webDocument.head.appendChild(style);
}
const menuKeys: ReadonlySet<Tab> = new Set(["menu", "recipes", "nutrition"]);
const memberTabs = tabs.filter(({ key }) => memberNavigationKeys.has(key));
/** Dropdown order (and default screen): Nấu ăn, Dinh dưỡng, Lịch. */
const menuTabs = (["recipes", "nutrition", "menu"] as const).map((key) => tabs.find((tab) => tab.key === key)!);
/** Capture bar: Chụp ảnh · QR gia đình · Chi tiêu (labels and order in navigation/captureBar.ts). */
const CAPTURE_ICONS: Record<CaptureActionKey, LucideIcon> = { photo: Camera, familyQr: QrCode, spending: Wallet };
const captureActions = CAPTURE_ACTIONS.map((action) => ({ ...action, icon: CAPTURE_ICONS[action.key], primary: action.key === "familyQr" }));

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
  // Bumped to open Đi chợ directly on Giỏ hàng (from "Cần mua tuần này" in Thông báo).
  const [cartOpenKey, setCartOpenKey] = useState(0);
  // Order notice tapped in Thông báo: Đi chợ opens Đơn hàng (a new key re-opens it).
  const [ordersOpenKey, setOrdersOpenKey] = useState(0);
  // The order a tapped notice (or push) is about: Đi chợ › Đơn hàng scrolls to and highlights it.
  const [ordersFocusId, setOrdersFocusId] = useState<string | null>(null);
  const openOrder = useCallback((orderId: string | null) => { setOrdersFocusId(orderId); setOrdersOpenKey((key) => key + 1); setTab("shopping"); }, []);
  // Lịch opened on today's meal (greeting card in Thông báo, "Chào buổi sáng" push); a new key re-opens it.
  const [menuFocus, setMenuFocus] = useState<{ meal: GreetingMeal; key: number } | null>(null);
  const openMeal = useCallback((meal: GreetingMeal) => { setMenuFocus({ meal, key: Date.now() }); setTab("menu"); }, []);
  const [authView, setAuthView] = useState<AuthView>("login");
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The session ended by itself (refresh token expired / revoked): back to Đăng nhập with "Phiên đăng nhập đã hết hạn".
  const { sessionNotice, clearSessionNotice } = session;
  useEffect(() => {
    if (!sessionNotice) return;
    setAuthView("login");
    setNotice(sessionNotice);
    clearSessionNotice();
  }, [sessionNotice, clearSessionNotice]);
  const [menuOpen, setMenuOpen] = useState(false);
  // Hồ sơ sheet and its sub-screen ("Thông tin sức khỏe", the nutrition profile form): the sub-screen opens over the
  // sheet and closing it (✕ / Quay lại / Android back) returns to the sheet as it was (profileNav.ts).
  const [profileNav, setProfileNav] = useState<ProfileNav>(PROFILE_CLOSED);
  const profileOpen = profileNav.sheetOpen;
  const setProfileOpen = (open: boolean) => setProfileNav(open ? { sheetOpen: true, sub: null } : PROFILE_CLOSED);
  const healthProfileOpen = profileNav.sub === "health";
  const [nutritionRefreshKey, setNutritionRefreshKey] = useState(0);
  // Closing it reloads the nutrition targets.
  const closeHealthProfile = () => { setProfileNav(closeProfileSub); setNutritionRefreshKey((key) => key + 1); };
  /** Back arrow, Android back or close: the health form saves itself first (or asks / stays). */
  const healthProfileRef = useRef<NutritionProfileHandle>(null);
  const leaveHealthProfile = async () => {
    const result = (await healthProfileRef.current?.leave()) ?? "closed";
    if (result === "stay") return;
    closeHealthProfile();
    if (result === "saved") setNotice("Đã lưu thông tin sức khỏe");
  };
  // Thông báo expiry alert tapped: Kho opens that item's edit dialog.
  const [inventoryFocusId, setInventoryFocusId] = useState<string | null>(null);
  // Thông báo tab badge = unread notifications + current expiry alerts.
  const [notificationBadge, setNotificationBadge] = useState(0);
  const badgeRunning = useRef(false);
  const badgePending = useRef(false);
  const [captureMode, setCaptureMode] = useState<InventoryCaptureMode | null>(null);
  // "QR gia đình" sheet (owner) or scanner (everyone else).
  const [familyQr, setFamilyQr] = useState<FamilyQrAction | null>(null);
  const [captureReady, setCaptureReady] = useState(false);
  // Result of the bottom-bar camera, handed to the capture panel when its sheet opens.
  const [capturePhoto, setCapturePhoto] = useState<UploadPhoto | null>(null);
  const [captureDialog, setCaptureDialog] = useState<{ text: string; settings: boolean } | null>(null);
  // "Chi tiêu" (capture bar): the family's Đi chợ spending, full screen.
  const [spendingOpen, setSpendingOpen] = useState(false);
  const closeCapture = () => { setCaptureReady(false); setCaptureMode(null); setCapturePhoto(null); };

  /**
   * Bottom bar. "Chụp ảnh": the phone camera opens in this tap (web: the camera file input is clicked synchronously
   * inside it); after the shot the Kho photo form opens. Without a family the sheet opens instead, to explain why
   * nothing can be saved. "Chi tiêu" opens the spending screen (its own "Bạn chưa có gia đình" state).
   */
  const startCapture = (key: CaptureActionKey) => {
    // "QR gia đình": the owner shows the family's one-time join QR; everyone else scans one.
    if (key === "familyQr") { setFamilyQr(familyQrAction(session.family?.currentUserRole)); return; }
    if (key === "spending") { setSpendingOpen(true); return; }
    if (!session.family?.id || !session.accessToken) { setCaptureReady(false); setCaptureMode(key); return; }
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
  // SCRUM-283: ADMIN accounts see only Quản trị (AdminHome, with its own tab bar); everyone else never sees it.
  // Derived (not synced in an effect) so no other tab renders for a frame after the role changes.
  const activeTab: Tab = isAdmin ? "admin" : tab === "admin" ? "inventory" : tab;
  const memberTabWidth = width >= breakpoints.wide ? Math.min(140, width / 6) : "16.666667%";
  const selectedMenuTab = menuTabs.find(({ key }) => key === activeTab) ?? menuTabs[0];
  // Hidden on Thông báo and in Hồ sơ with its own screens (cài đặt thông báo, sức khỏe, số món).
  // Đi chợ selection mode: its one-line bar takes the capture bar's place (same height) until selection ends.
  const marketSelection = useMarketSelectionBar();
  const overlayOpen = profileOpen || healthProfileOpen || spendingOpen;
  const showSelectionBar = marketSelection.active && activeTab === "shopping" && !isAdmin && !overlayOpen && !paymentUrl;
  const showCaptureBar = captureBarVisible({ tab: activeTab, isAdmin, profileOpen: overlayOpen, paymentOpen: !!paymentUrl, selecting: showSelectionBar });
  // Thông báo selection mode: "✕ · N đã chọn · Xóa" at the bottom (Thông báo has no capture bar).
  const notificationSelection = useNotificationSelectionBar();
  const showNotificationSelectionBar = notificationSelection.active && activeTab === "notifications" && !isAdmin && !overlayOpen && !paymentUrl;

  /** Unread notifications (status SENT, as the old "Chưa đọc" filter) + expiry alerts; one request at a time. */
  // Tab switches / app resume refresh it at most every 15 s; real changes (feed reload, deletions) force it.
  const badgeLastAt = useRef<number | null>(null);
  const refreshNotificationBadge = useCallback(async (force = false): Promise<void> => {
    const token = session.accessToken;
    if (isAdmin || !token) { setNotificationBadge(0); return; }
    if (badgeRunning.current) { badgePending.current = true; return; }
    if (!shouldRefreshBadge(badgeLastAt.current, Date.now(), force)) return;
    badgeLastAt.current = Date.now();
    badgeRunning.current = true;
    try {
      const [unread, expiring, dismissals] = await Promise.allSettled([
        createGatewayClient(token).get<{ total?: number }>("/api/notifications/notifications?status=SENT&limit=1"),
        session.family?.id ? inventoryApi.expiring(token, session.family.id, EXPIRY_ALERT_DAYS) : Promise.resolve(null),
        createGatewayClient(token).get<{ keys: string[] }>("/api/notifications/notifications/dismissals"),
      ]);
      const unreadCount = unread.status === "fulfilled" ? unread.value.total ?? 0 : 0;
      // Expiry alerts the user removed in Thông báo (same keys as the feed) are not counted.
      const dismissed = new Set(dismissals.status === "fulfilled" ? dismissals.value.keys : []);
      const expiryCount = expiring.status === "fulfilled" ? visibleExpiryAlerts(expiring.value?.items ?? []).filter((item) => !dismissed.has(expiryDismissKey(item))).length : 0;
      setNotificationBadge(unreadCount + expiryCount);
    } finally {
      badgeRunning.current = false;
      if (badgePending.current) { badgePending.current = false; void refreshNotificationBadge(true); }
    }
  }, [isAdmin, session.accessToken, session.family?.id]);

  // On sign-in, tab changes and every minute while the app is in the foreground.
  useEffect(() => { void refreshNotificationBadge(); }, [refreshNotificationBadge, activeTab]);
  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === "active") void refreshNotificationBadge(true); }, 60_000);
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

  // Tapping the 07:00 "Chào buổi sáng" push: Lịch on today's breakfast (or the home when there was no menu).
  // expo-notifications is loaded lazily like registerDeviceToken; native only.
  useEffect(() => {
    if (Platform.OS === "web" || !session.user) return undefined;
    let subscription: { remove: () => void } | null = null;
    let active = true;
    const handle = (data: unknown) => {
      if (!active) return;
      // An order push (if one is ever sent) opens Đi chợ › Đơn hàng on that order, like the in-app notice.
      const order = orderTarget(data);
      if (order) { openOrder(order.orderId); return; }
      const target = pushTarget(data);
      if (!target || !active) return;
      if (target.meal) openMeal(target.meal);
    };
    void import("expo-notifications").then(async (Notifications) => {
      if (!active) return;
      subscription = Notifications.addNotificationResponseReceivedListener((response) => handle(response.notification.request.content.data));
      const last = await Notifications.getLastNotificationResponseAsync().catch(() => null);
      if (last) handle(last.notification.request.content.data);
    }).catch(() => undefined);
    return () => { active = false; subscription?.remove(); };
  }, [session.user?.id, openMeal, openOrder]);

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

  // Shipper accounts see only the shipper shell (orders): no Kho / Đi chợ / Nấu ăn / Gia đình, capture bar or wizards.
  const shell = appShellFor(session.user?.role);
  if (shell === "shipper") {
    return withNotice(<ShipperHome onSignOut={() => void session.signOut()} />);
  }

  // "Thông tin cơ bản" wizard after a real sign-in (not a restored session); it ends at once when a profile already
  // exists. Normal users only.
  if (showsOnboarding(shell, session.freshSignIn)) {
    return withNotice(<OnboardingWizard onDone={session.completeOnboarding} />);
  }

  const signOut = () => {
    setCaptureMode(null);
    setCaptureReady(false);
    void session.signOut();
  };
  return (
    <SafeAreaView style={styles.container}>
      {/* Admin accounts: AdminHome draws its own tab bar (sections + Đăng xuất) right here. */}
      {isAdmin ? null : (
        <View style={[topTabStyles.bar, styles.memberTabRow]}>
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
                // The Nấu ăn / Dinh dưỡng / Lịch group: from another tab it opens Nấu ăn; once inside, it opens the dropdown.
                onPress={() => {
                  if (key !== "menu") { setTab(key); return; }
                  if (menuKeys.has(activeTab)) setMenuOpen((open) => !open);
                  else setTab("recipes");
                }}
                style={[topTabStyles.tab, { width: memberTabWidth }, active && topTabStyles.tabActive]}
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
                <Text numberOfLines={2} style={[topTabStyles.tabText, active && topTabStyles.tabTextActive]}>{displayedTab.label}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            accessibilityLabel="Hồ sơ người dùng"
            accessibilityRole="button"
            accessibilityState={{ expanded: profileOpen }}
            onPress={() => setProfileOpen(true)}
            style={[topTabStyles.tab, { width: memberTabWidth }]}
          >
            <AppIcon icon={CircleUserRound} size="md" color={colors.muted} />
            <Text style={topTabStyles.tabText}>Hồ sơ</Text>
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

      <Modal transparent animationType="fade" visible={profileOpen && !isAdmin} onRequestClose={() => setProfileNav(profileBack)}>
        <View style={styles.sheetOverlay}>
          <Pressable accessibilityLabel="Đóng hồ sơ" accessibilityRole="button" onPress={() => setProfileOpen(false)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={styles.sheetPanel}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Hồ sơ người dùng</Text>
              <TouchableOpacity accessibilityLabel="Đóng" accessibilityRole="button" onPress={() => setProfileOpen(false)} style={styles.sheetClose}>
                <AppIcon icon={X} size="md" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <ProfileHeader />
              <Text style={styles.profileLabel}>Email</Text>
              <Text style={styles.profileValue}>{session.user.email}</Text>
              <Text style={styles.profileLabel}>Vai trò trong gia đình</Text>
              <Text style={styles.profileValue}>{session.family?.currentUserRole ? familyRoleLabel(session.family.currentUserRole) : "Chưa tham gia gia đình"}</Text>
              <TouchableOpacity accessibilityLabel="Thông tin sức khỏe" accessibilityRole="button"
                onPress={() => setProfileNav((nav) => openProfileSub(nav, "health"))} style={styles.sheetItem}>
                <AppIcon icon={HeartPulse} size="md" color={colors.primary} />
                <Text style={styles.sheetItemText}>Thông tin sức khỏe</Text>
                <AppIcon icon={ChevronRight} size="sm" color={colors.muted} />
              </TouchableOpacity>
              <TouchableOpacity accessibilityLabel="Đăng xuất" accessibilityRole="button"
                onPress={() => { setProfileOpen(false); signOut(); }} style={styles.sheetItem}>
                <AppIcon icon={LogOut} size="md" color={colors.danger} />
                <Text style={styles.sheetSignOutText}>Đăng xuất</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        {/* Nested in the Hồ sơ modal: it opens over the sheet, which stays mounted (state and scroll kept). */}
        <Modal animationType="slide" visible={healthProfileOpen && !isAdmin} onRequestClose={() => void leaveHealthProfile()}>
          <SafeAreaView style={styles.settingsScreen}>
            <View style={styles.settingsHeader}>
              <IconButton icon={ChevronLeft} accessibilityLabel="Quay lại" color={colors.text} onPress={() => void leaveHealthProfile()} />
              <Text style={styles.settingsTitle}>Thông tin sức khỏe</Text>
            </View>
            <View style={styles.healthBody}>
              <NutritionProfileScreen ref={healthProfileRef} />
            </View>
          </SafeAreaView>
        </Modal>
        </View>
      </Modal>


      <FamilyQrSheet visible={familyQr === "show" && !isAdmin} onClose={() => setFamilyQr(null)} />
      <FamilyQrScanner
        visible={familyQr === "scan" && !isAdmin}
        onClose={() => setFamilyQr(null)}
        onJoined={(name) => { setNotice(`Đã tham gia gia đình ${name}`); setInventoryRefreshKey((current) => current + 1); }}
      />

      <Modal transparent animationType="slide" visible={captureMode !== null && !isAdmin} onShow={() => setCaptureReady(true)} onRequestClose={closeCapture}>
        <KeyboardAvoidingView style={styles.captureOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable accessibilityLabel="Đóng chức năng" accessibilityRole="button" onPress={closeCapture} style={StyleSheet.absoluteFill} />
          <View style={styles.captureSheet}>
            <View style={styles.captureHeader}>
              <Text style={styles.captureTitle}>Chụp ảnh sản phẩm</Text>
              <TouchableOpacity accessibilityLabel="Đóng" accessibilityRole="button" onPress={closeCapture} style={styles.sheetClose}>
                <AppIcon icon={X} size="md" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={styles.captureScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}>
              {captureMode && (
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
        {!paymentUrl && activeTab === "shopping" && <ShoppingCartScreen onOpenFamily={() => setTab("family")} openCartKey={cartOpenKey} openOrdersKey={ordersOpenKey} focusOrderId={ordersFocusId} onOrdered={() => setInventoryRefreshKey((current) => current + 1)} />}
        {!paymentUrl && activeTab === "menu" && (
          <MenuScreen
            accessToken={session.accessToken}
            familyId={session.family?.id}
            focusMeal={menuFocus}
          />
        )}
        {!paymentUrl && activeTab === "family" && <FamilyScreenFlow />}
        {!paymentUrl && activeTab === "notifications" && (
          <NotificationsHome
            onOpenInventoryItem={(itemId) => { setInventoryFocusId(itemId); setTab("inventory"); }}
            onChanged={() => void refreshNotificationBadge(true)}
            onOpenCart={() => { setCartOpenKey((key) => key + 1); setTab("shopping"); }}
            onOpenOrder={openOrder}
          />
        )}
        {!paymentUrl && activeTab === "admin" && isAdmin && <AdminHome onSignOut={signOut} />}
        {/* Hồ sơ / Nhật ký / Thống kê / Gợi ý; never for ADMIN accounts (they only see Quản trị). */}
        {!paymentUrl && activeTab === "nutrition" && !isAdmin && (
          <NutritionHome refreshKey={nutritionRefreshKey} />
        )}
      </View>
      {showCaptureBar && (
        <CaptureBar actions={captureActions} onPress={startCapture} />
      )}
      {showSelectionBar && <SelectionBar state={marketSelection} onExit={marketSelectionBar.exit} onAdd={marketSelectionBar.add} />}
      {showNotificationSelectionBar && <SelectionBar state={notificationSelection} onExit={notificationSelectionBar.exit} onAdd={notificationSelectionBar.add} actionLabel="Xóa" actionIcon={Trash2} destructive />}
      <SpendingScreen visible={spendingOpen && !isAdmin} onClose={() => setSpendingOpen(false)} onOpenFamily={() => setTab("family")} />
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
  memberTabRow: { flexDirection: "row", justifyContent: "center" },
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
    maxHeight: "90%",
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
