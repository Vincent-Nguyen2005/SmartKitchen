import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BadgePercent, Camera, Carrot, ChartColumn, CookingPot, LayoutDashboard, LogOut, PackageCheck, ShieldExclamationPoint, Truck } from "lucide-react-native";
import { AppIcon, breakpoints, spacing, type LucideIcon } from "../../theme";
import { useConfirm } from "../../components/ConfirmDialog";
import { TopTabButton, topTabStyles } from "../../components/TopTab";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { colors, styles, useLayout } from "../notifications/ui";
import AdminDashboardScreen from "./AdminDashboardScreen";
import AdminShippersScreen from "./AdminShippersScreen";
import IngredientsScreen from "./IngredientsScreen";
import RecipesScreen from "./RecipesScreen";
// "Khuyến mãi" = the daily automatic discounts; checkout promotions ("Chương trình") are off (CHECKOUT_PROMOTIONS_ENABLED).
import DailyDealsScreen from "./DailyDealsScreen";
import { ADMIN_SECTIONS, adminSectionMemory, LOGOUT_CONFIRM, LOGOUT_LABEL, type AdminSection } from "./adminSections";
import { CaptureBar } from "../../components/CaptureBar";
import { ADMIN_BAR_ACTIONS, overlayFor, type AdminBarAction, type AdminOverlay } from "./adminBar";
import AdminCreateFromPhoto, { type CreateRequest } from "./AdminCreateFromPhoto";
import AdminOrdersScreen from "./AdminOrdersScreen";
import AdminRevenueScreen from "./AdminRevenueScreen";

const BAR_ICONS: Record<AdminBarAction, LucideIcon> = { photo: Camera, orders: PackageCheck, revenue: ChartColumn };

// "Trọng số" is hidden: no service reads the recommendation weights yet (WeightsScreen.tsx and the admin-service
// routes/tables are kept). "Hệ thống" is not a tab either (SystemHealthScreen.tsx kept, not rendered).
const SECTION_ICONS: Record<AdminSection, LucideIcon> = {
  dashboard: LayoutDashboard, ingredients: Carrot, recipes: CookingPot, promotions: BadgePercent, shippers: Truck,
};

type Props = {
  /** Đăng xuất (the last item of the tab bar, after the in-app confirm). */
  onSignOut: () => void;
};

/**
 * Admin area. App.tsx shows it (and only it) when useSession().user.role === "ADMIN"; this check is a UI guard only
 * — admin-service enforces the role on every request. One top tab bar in the app's tab style (icon above label,
 * underline on the active tab): Tổng quan, Nguyên liệu, Món ăn, Khuyến mãi, Giao hàng, then Đăng xuất drawn the same
 * way (icon above its label; it asks "Đăng xuất khỏi tài khoản quản trị?" first). The six items share the row equally
 * on phones (labels wrap to two lines on narrow ones, like the member bar); content starts right under it. At the
 * bottom the capture-bar look with admin actions: Chụp ảnh (catalog image) · Đơn hàng (centre) · Doanh thu.
 */
export default function AdminHome({ onSignOut }: Props): React.JSX.Element {
  const { isAdmin } = useGatewayApi();
  const { width } = useLayout();
  const [section, setSectionState] = useState<AdminSection>(adminSectionMemory.get());
  // Bottom bar: the Chụp ảnh sheet, or the Đơn hàng / Doanh thu full-screen page (one at a time).
  const [overlay, setOverlay] = useState<AdminOverlay>(null);
  // "Chụp ảnh" → the create form of Nguyên liệu or Món ăn, prefilled (CreateRequest.key: one form per request).
  const [createRequest, setCreateRequest] = useState<CreateRequest | null>(null);
  const setSection = (next: AdminSection) => setSectionState(adminSectionMemory.set(next));
  const wide = width >= breakpoints.wide;
  const { confirm, dialog } = useConfirm();
  const signOut = async () => { if (await confirm({ ...LOGOUT_CONFIRM })) onSignOut(); };
  // Phones: equal shares of the row; wide screens: the member bar's 140 px tabs, centred.
  const tabSize = wide ? { width: 140 } : { flex: 1 };

  if (!isAdmin) {
    return (
      <View style={[styles.screen, styles.state]}>
        <AppIcon icon={ShieldExclamationPoint} size="xl" color={colors.warning} />
        <Text style={styles.headline} accessibilityRole="header">Không có quyền truy cập</Text>
        <Text style={styles.mutedText}>Khu vực này chỉ dành cho quản trị viên.</Text>
      </View>
    );
  }
  return (
    <View style={styles.screen}>
      <View accessibilityRole="tablist" style={[topTabStyles.bar, local.bar]}>
        <View style={[local.tabs, wide && local.tabsWide]}>
          {ADMIN_SECTIONS.map(({ key, label }) => (
            <TopTabButton
              key={key}
              label={label}
              icon={SECTION_ICONS[key]}
              active={section === key}
              onPress={() => setSection(key)}
              {...tabSize}
            />
          ))}
          <TopTabButton label={LOGOUT_LABEL} icon={LogOut} active={false} role="button" onPress={() => void signOut()} {...tabSize} />
        </View>
      </View>
      {/* The content takes the space above the bottom bar (never behind it). */}
      <View style={local.content}>
        <>
                  {section === "dashboard" && <AdminDashboardScreen />}
                  {section === "ingredients" && <IngredientsScreen createRequest={createRequest?.kind === "ingredient" ? createRequest : null} onCreateHandled={() => setCreateRequest(null)} />}
                  {section === "recipes" && <RecipesScreen createRequest={createRequest?.kind === "recipe" ? createRequest : null} onCreateHandled={() => setCreateRequest(null)} />}
                  {section === "promotions" && <DailyDealsScreen />}
                  {section === "shippers" && <AdminShippersScreen />}
        </>
      </View>
      <CaptureBar
        actions={ADMIN_BAR_ACTIONS.map((action) => ({ ...action, icon: BAR_ICONS[action.key], active: overlay === action.key }))}
        onPress={(key) => setOverlay(overlayFor(key))}
      />
      <AdminCreateFromPhoto
        visible={overlay === "photo"}
        onClose={() => setOverlay(null)}
        onReady={(request) => {
          setOverlay(null);
          setSection(request.kind === "ingredient" ? "ingredients" : "recipes");
          setCreateRequest({ ...request, key: Date.now() });
        }}
      />
      <AdminOrdersScreen visible={overlay === "orders"} onClose={() => setOverlay(null)} />
      <AdminRevenueScreen visible={overlay === "revenue"} onClose={() => setOverlay(null)} />
      {dialog}
    </View>
  );
}

const local = StyleSheet.create({
  bar: { alignItems: "center", flexDirection: "row" },
  tabs: { flex: 1, flexDirection: "row", minWidth: 0 },
  tabsWide: { justifyContent: "center" },
  content: { flex: 1 },
});
