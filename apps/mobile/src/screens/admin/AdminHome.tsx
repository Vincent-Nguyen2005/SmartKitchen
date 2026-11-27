import React, { useEffect, useState } from "react";
import { BackHandler, StyleSheet, Text, View } from "react-native";
import { BadgePercent, Camera, Carrot, ChartColumn, CookingPot, LayoutDashboard, LogOut, PackageCheck, ShieldExclamationPoint, Truck } from "lucide-react-native";
import { AppIcon, IconButton, breakpoints, spacing, type LucideIcon } from "../../theme";
import { TopTabButton, topTabStyles } from "../../components/TopTab";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { colors, styles, useLayout } from "../notifications/ui";
import AdminDashboardScreen from "./AdminDashboardScreen";
import AdminFamiliesScreen from "./AdminFamiliesScreen";
import AdminFamilyDetailScreen from "./AdminFamilyDetailScreen";
import AdminUsersScreen from "./AdminUsersScreen";
import AdminShippersScreen from "./AdminShippersScreen";
import IngredientsScreen from "./IngredientsScreen";
import RecipesScreen from "./RecipesScreen";
import PromotionsHome from "./PromotionsHome";
import { ADMIN_SECTIONS, adminSectionMemory, type AdminSection } from "./adminSections";
import { CaptureBar } from "../../components/CaptureBar";
import { ADMIN_BAR_ACTIONS, overlayFor, type AdminBarAction, type AdminOverlay } from "./adminBar";
import AdminCatalogPhoto from "./AdminCatalogPhoto";
import AdminOrdersScreen from "./AdminOrdersScreen";
import AdminRevenueScreen from "./AdminRevenueScreen";

const BAR_ICONS: Record<AdminBarAction, LucideIcon> = { photo: Camera, orders: PackageCheck, revenue: ChartColumn };

// "Trọng số" is hidden: no service reads the recommendation weights yet (WeightsScreen.tsx and the admin-service
// routes/tables are kept). "Hệ thống" is not a tab either (SystemHealthScreen.tsx kept, not rendered).
const SECTION_ICONS: Record<AdminSection, LucideIcon> = {
  dashboard: LayoutDashboard, ingredients: Carrot, recipes: CookingPot, promotions: BadgePercent, shippers: Truck,
};

/**
 * Screens pushed over the selected section (the empty stack). Back pops one level, so a family opened
 * from the families list returns to that list, and one opened from the dashboard returns there.
 */
type AdminRoute =
  | { name: "users" }
  | { name: "families" }
  | { name: "familyDetail"; familyId: string; familyName: string };

type Props = {
  /** Đăng xuất (small icon at the right end of the tab bar). */
  onSignOut: () => void;
};

/**
 * Admin area. App.tsx shows it (and only it) when useSession().user.role === "ADMIN"; this check is a UI guard only
 * — admin-service enforces the role on every request. One top tab bar in the app's tab style (icon above label,
 * underline on the active tab): Tổng quan, Nguyên liệu, Món ăn, Khuyến mãi, Giao hàng, then Đăng xuất. The
 * five tabs share the row equally (one row on any phone, like the member bar); content starts right under it. At the
 * bottom the capture-bar look with admin actions: Chụp ảnh (catalog image) · Đơn hàng (centre) · Doanh thu.
 */
export default function AdminHome({ onSignOut }: Props): React.JSX.Element {
  const { isAdmin } = useGatewayApi();
  const { width } = useLayout();
  const [section, setSectionState] = useState<AdminSection>(adminSectionMemory.get());
  const [stack, setStack] = useState<AdminRoute[]>([]);
  // Bottom bar: the Chụp ảnh sheet, or the Đơn hàng / Doanh thu full-screen page (one at a time).
  const [overlay, setOverlay] = useState<AdminOverlay>(null);
  const route = stack[stack.length - 1];
  const setSection = (next: AdminSection) => { setSectionState(adminSectionMemory.set(next)); setStack([]); };
  const push = (next: AdminRoute) => setStack((current) => [...current, next]);
  const back = () => setStack((current) => current.slice(0, -1));
  const openFamily = (family: { id: string; name: string }) => push({ name: "familyDetail", familyId: family.id, familyName: family.name });
  const wide = width >= breakpoints.wide;

  // Android back button pops a pushed admin screen instead of leaving the app.
  const hasPushed = stack.length > 0;
  useEffect(() => {
    if (!hasPushed) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setStack((current) => current.slice(0, -1));
      return true;
    });
    return () => subscription.remove();
  }, [hasPushed]);

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
              // Phones: equal shares of the row; wide screens: the member bar's 140 px tabs, centred.
              {...(wide ? { width: 140 } : { flex: 1 })}
            />
          ))}
        </View>
        <IconButton icon={LogOut} size="md" color={colors.muted} accessibilityLabel="Đăng xuất" onPress={onSignOut} />
      </View>
      {/* The content takes the space above the bottom bar (never behind it). */}
      <View style={local.content}>
        {route?.name === "users" ? <AdminUsersScreen onBack={back} />
          : route?.name === "families" ? <AdminFamiliesScreen onBack={back} onOpenFamily={openFamily} />
            // key: a different family remounts the screen instead of showing stale data.
            : route?.name === "familyDetail" ? <AdminFamilyDetailScreen key={route.familyId} familyId={route.familyId} familyName={route.familyName} onBack={back} />
              : (
                <>
                  {section === "dashboard" && (
                    <AdminDashboardScreen
                      onOpenUsers={() => push({ name: "users" })}
                      onOpenFamilies={() => push({ name: "families" })}
                      onOpenFamily={openFamily}
                    />
                  )}
                  {section === "ingredients" && <IngredientsScreen />}
                  {section === "recipes" && <RecipesScreen />}
                  {section === "promotions" && <PromotionsHome />}
                  {section === "shippers" && <AdminShippersScreen />}
                </>
              )}
      </View>
      <CaptureBar
        actions={ADMIN_BAR_ACTIONS.map((action) => ({ ...action, icon: BAR_ICONS[action.key], active: overlay === action.key }))}
        onPress={(key) => setOverlay(overlayFor(key))}
      />
      <AdminCatalogPhoto visible={overlay === "photo"} onClose={() => setOverlay(null)} />
      <AdminOrdersScreen visible={overlay === "orders"} onClose={() => setOverlay(null)} />
      <AdminRevenueScreen visible={overlay === "revenue"} onClose={() => setOverlay(null)} />
    </View>
  );
}

const local = StyleSheet.create({
  bar: { alignItems: "center", flexDirection: "row", paddingRight: spacing.xs },
  tabs: { flex: 1, flexDirection: "row", minWidth: 0 },
  tabsWide: { justifyContent: "center" },
  content: { flex: 1 },
});
