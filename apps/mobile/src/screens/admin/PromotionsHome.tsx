import React, { useState } from "react";
import { View } from "react-native";
import { spacing } from "../../theme";
import { SegmentTabs } from "../../components/SegmentTabs";
import { styles, useLayout } from "../notifications/ui";
import PromotionsScreen from "./PromotionsScreen";
import DailyDealsScreen from "./DailyDealsScreen";

type Tab = "programs" | "dailyDeals";
const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: "programs", label: "Chương trình" },
  { value: "dailyDeals", label: "Giảm giá tự động" },
];

/**
 * Quản trị › "Khuyến mãi": checkout promotions ("Chương trình", applied automatically at checkout) and the automatic
 * daily discounts ("Giảm giá tự động") in one section, switched with the shared segment tabs. Both screens and their
 * endpoints are unchanged.
 */
export default function PromotionsHome(): React.JSX.Element {
  const { gutter } = useLayout();
  const [tab, setTab] = useState<Tab>("programs");
  return (
    <View style={styles.screen}>
      <View style={{ paddingHorizontal: gutter, paddingTop: spacing.md }}>
        <SegmentTabs options={TABS} value={tab} onChange={setTab} />
      </View>
      <View style={{ flex: 1 }}>
        {tab === "programs" ? <PromotionsScreen /> : <DailyDealsScreen />}
      </View>
    </View>
  );
}
