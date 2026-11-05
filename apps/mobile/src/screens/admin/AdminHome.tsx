import React, { useState } from "react";
import { Text, View } from "react-native";
import { Activity, Carrot, Flag, LayoutDashboard, ShieldExclamationPoint, SlidersHorizontal } from "lucide-react-native";
import { AppIcon } from "../../theme";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { colors, Segmented, styles, useLayout } from "../notifications/ui";
import DashboardScreen from "./DashboardScreen";
import IngredientsScreen from "./IngredientsScreen";
import ReportsScreen from "./ReportsScreen";
import SystemHealthScreen from "./SystemHealthScreen";
import WeightsScreen from "./WeightsScreen";

type Section = "overview" | "ingredients" | "weights" | "health" | "reports";

/**
 * Admin area. The entry point is only shown when useSession().user.role === "ADMIN";
 * this check is a UI guard only — admin-service enforces the role on every request.
 */
export default function AdminHome(): React.JSX.Element {
  const { isAdmin } = useGatewayApi();
  const { gutter } = useLayout();
  const [section, setSection] = useState<Section>("overview");

  if (!isAdmin) {
    return (
      <View style={[styles.screen, styles.state]}>
        <AppIcon icon={ShieldExclamationPoint} size="xl" color={colors.warning} />
        <Text style={styles.title}>Không có quyền truy cập</Text>
        <Text style={styles.mutedText}>Khu vực này chỉ dành cho quản trị viên.</Text>
      </View>
    );
  }
  return (
    <View style={styles.screen}>
      <View style={{ paddingHorizontal: gutter }}>
        <Segmented<Section>
          label="Mục quản trị"
          value={section}
          onChange={setSection}
          options={[
            { value: "overview", label: "Tổng quan", icon: LayoutDashboard },
            { value: "reports", label: "Báo cáo", icon: Flag },
            { value: "health", label: "Hệ thống", icon: Activity },
            { value: "ingredients", label: "Nguyên liệu", icon: Carrot },
            { value: "weights", label: "Trọng số", icon: SlidersHorizontal },
          ]}
        />
      </View>
      <View style={{ flex: 1 }}>
        {section === "overview" && <DashboardScreen />}
        {section === "reports" && <ReportsScreen />}
        {section === "health" && <SystemHealthScreen />}
        {section === "ingredients" && <IngredientsScreen />}
        {section === "weights" && <WeightsScreen />}
      </View>
    </View>
  );
}
