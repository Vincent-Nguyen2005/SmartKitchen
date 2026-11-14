import React, { useEffect, useState } from "react";
import { BackHandler, Text, View } from "react-native";
import { Activity, Carrot, ChartColumn, Flag, LayoutDashboard, ShieldExclamationPoint, SlidersHorizontal } from "lucide-react-native";
import { AppIcon } from "../../theme";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { colors, PageTitle, Segmented, styles, useLayout } from "../notifications/ui";
import AdminDashboardScreen from "./AdminDashboardScreen";
import AdminFamilyDetailScreen from "./AdminFamilyDetailScreen";
import AdminUsersScreen from "./AdminUsersScreen";
import DashboardScreen from "./DashboardScreen";
import IngredientsScreen from "./IngredientsScreen";
import ReportsScreen from "./ReportsScreen";
import SystemHealthScreen from "./SystemHealthScreen";
import WeightsScreen from "./WeightsScreen";

type Section = "dashboard" | "overview" | "ingredients" | "weights" | "health" | "reports";

/** Admin stack: the sectioned home, with users / family detail pushed on top of the dashboard. */
type AdminRoute =
  | { name: "home" }
  | { name: "users" }
  | { name: "familyDetail"; familyId: string; familyName: string };

/**
 * Admin area. App.tsx shows it (and only it) when useSession().user.role === "ADMIN";
 * this check is a UI guard only — admin-service enforces the role on every request.
 */
export default function AdminHome(): React.JSX.Element {
  const { isAdmin } = useGatewayApi();
  const { gutter } = useLayout();
  const [section, setSection] = useState<Section>("dashboard");
  const [route, setRoute] = useState<AdminRoute>({ name: "home" });

  // Android back button pops a pushed admin screen instead of leaving the app.
  useEffect(() => {
    if (route.name === "home") return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setRoute({ name: "home" });
      return true;
    });
    return () => subscription.remove();
  }, [route.name]);

  if (!isAdmin) {
    return (
      <View style={[styles.screen, styles.state]}>
        <AppIcon icon={ShieldExclamationPoint} size="xl" color={colors.warning} />
        <Text style={styles.headline} accessibilityRole="header">Không có quyền truy cập</Text>
        <Text style={styles.mutedText}>Khu vực này chỉ dành cho quản trị viên.</Text>
      </View>
    );
  }
  const goHome = () => setRoute({ name: "home" });
  if (route.name === "users") return <AdminUsersScreen onBack={goHome} />;
  if (route.name === "familyDetail") {
    return <AdminFamilyDetailScreen familyId={route.familyId} familyName={route.familyName} onBack={goHome} />;
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
            { value: "health", label: "Hệ thống", icon: Activity },
            { value: "ingredients", label: "Nguyên liệu", icon: Carrot },
            { value: "weights", label: "Trọng số", icon: SlidersHorizontal },
          ]}
        />
      </View>
      <View style={{ flex: 1 }}>
        {section === "dashboard" && (
          <AdminDashboardScreen
            onOpenUsers={() => setRoute({ name: "users" })}
            onOpenFamily={(family) => setRoute({ name: "familyDetail", familyId: family.id, familyName: family.name })}
          />
        )}
        {section === "overview" && <DashboardScreen />}
        {section === "reports" && <ReportsScreen />}
        {section === "health" && <SystemHealthScreen />}
        {section === "ingredients" && <IngredientsScreen />}
        {section === "weights" && <WeightsScreen />}
      </View>
    </View>
  );
}
