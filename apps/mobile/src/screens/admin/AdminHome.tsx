import React, { useEffect, useState } from "react";
import { BackHandler, Text, View } from "react-native";
import { Carrot, ChartColumn, Flag, LayoutDashboard, ShieldExclamationPoint } from "lucide-react-native";
import { AppIcon } from "../../theme";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { colors, PageTitle, Segmented, styles, useLayout } from "../notifications/ui";
import AdminDashboardScreen from "./AdminDashboardScreen";
import AdminFamiliesScreen from "./AdminFamiliesScreen";
import AdminFamilyDetailScreen from "./AdminFamilyDetailScreen";
import AdminUsersScreen from "./AdminUsersScreen";
import DashboardScreen from "./DashboardScreen";
import IngredientsScreen from "./IngredientsScreen";
import ReportsScreen from "./ReportsScreen";

// "Hệ thống" was removed from the tabs; SystemHealthScreen.tsx is kept but no longer rendered.
// "Trọng số" is hidden: no service reads the recommendation weights yet (WeightsScreen.tsx and the
// admin-service routes/tables are kept). Show it again once a consumer exists.
type Section = "dashboard" | "overview" | "ingredients" | "reports";

/**
 * Screens pushed over the sectioned home (the empty stack). Back pops one level, so a family opened
 * from the families list returns to that list, and one opened from the dashboard returns there.
 */
type AdminRoute =
  | { name: "users" }
  | { name: "families" }
  | { name: "familyDetail"; familyId: string; familyName: string };

/**
 * Admin area. App.tsx shows it (and only it) when useSession().user.role === "ADMIN";
 * this check is a UI guard only — admin-service enforces the role on every request.
 */
export default function AdminHome(): React.JSX.Element {
  const { isAdmin } = useGatewayApi();
  const { gutter } = useLayout();
  const [section, setSection] = useState<Section>("dashboard");
  const [stack, setStack] = useState<AdminRoute[]>([]);
  const route = stack[stack.length - 1];
  const push = (next: AdminRoute) => setStack((current) => [...current, next]);
  const back = () => setStack((current) => current.slice(0, -1));
  const openFamily = (family: { id: string; name: string }) => push({ name: "familyDetail", familyId: family.id, familyName: family.name });

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
  if (route?.name === "users") return <AdminUsersScreen onBack={back} />;
  if (route?.name === "families") return <AdminFamiliesScreen onBack={back} onOpenFamily={openFamily} />;
  if (route?.name === "familyDetail") {
    // key: a different family remounts the screen instead of showing stale data.
    return <AdminFamilyDetailScreen key={route.familyId} familyId={route.familyId} familyName={route.familyName} onBack={back} />;
  }
  return (
    <View style={styles.screen}>
      <View style={{ paddingHorizontal: gutter }}>
        <PageTitle>Quản trị</PageTitle>
        <Segmented<Section>
          label="Mục quản trị"
          value={section}
          onChange={setSection}
          options={[
            { value: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
            { value: "overview", label: "Thống kê", icon: ChartColumn },
            { value: "reports", label: "Báo cáo", icon: Flag },
            { value: "ingredients", label: "Nguyên liệu", icon: Carrot },
          ]}
        />
      </View>
      <View style={{ flex: 1 }}>
        {section === "dashboard" && (
          <AdminDashboardScreen
            onOpenUsers={() => push({ name: "users" })}
            onOpenFamilies={() => push({ name: "families" })}
            onOpenFamily={openFamily}
          />
        )}
        {section === "overview" && (
          // Báo cáo mounts fresh on the "Mới" filter, so opening it from here shows pending reports.
          <DashboardScreen onOpenReports={() => setSection("reports")} />
        )}
        {section === "reports" && <ReportsScreen />}
        {section === "ingredients" && <IngredientsScreen />}
      </View>
    </View>
  );
}
