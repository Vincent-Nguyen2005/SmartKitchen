import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { BarChart3, NotebookPen, Sparkles, UserRound } from "lucide-react-native";
import { colors, spacing } from "../../theme";
import { Segmented, useLayout } from "../notifications/ui";
import MealDiaryScreen from "../meal-diary/MealDiaryScreen";
import NutritionProfileScreen from "./NutritionProfileScreen";
import NutritionStatsScreen from "./NutritionStatsScreen";
import SuggestionsScreen from "./SuggestionsScreen";

type Segment = "profile" | "diary" | "stats" | "suggestions";

/**
 * The "Dinh dưỡng" tab: one segment row (the shared chip style), then one screen. Only the selected screen is
 * mounted, so each keeps its own ScrollView and reloads (e.g. a new calorie goal) when it is opened again.
 */
export default function NutritionHome(): React.JSX.Element {
  const { gutter, isWide } = useLayout();
  const [segment, setSegment] = useState<Segment>("profile");
  const openProfile = () => setSegment("profile");

  return (
    <View style={styles.container}>
      <View style={[styles.segments, { paddingHorizontal: gutter }]}>
        <View style={isWide && styles.wide}>
          <Segmented<Segment>
            label="Dinh dưỡng"
            value={segment}
            onChange={setSegment}
            options={[
              { value: "profile", label: "Hồ sơ", icon: UserRound },
              { value: "diary", label: "Nhật ký", icon: NotebookPen },
              { value: "stats", label: "Thống kê", icon: BarChart3 },
              { value: "suggestions", label: "Gợi ý", icon: Sparkles },
            ]}
          />
        </View>
      </View>
      <View style={styles.body}>
        {segment === "profile" && <NutritionProfileScreen />}
        {segment === "diary" && <MealDiaryScreen onOpenProfile={openProfile} />}
        {segment === "stats" && <NutritionStatsScreen onOpenProfile={openProfile} />}
        {segment === "suggestions" && <SuggestionsScreen onOpenProfile={openProfile} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1 },
  segments: { backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: spacing.sm },
  wide: { alignSelf: "center", maxWidth: 920, width: "100%" },
  body: { flex: 1 },
});
