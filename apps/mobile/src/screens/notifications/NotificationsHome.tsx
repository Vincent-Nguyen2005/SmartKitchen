import React, { useState } from "react";
import { View } from "react-native";
import { Bell, Settings, Tag } from "lucide-react-native";
import NotificationListScreen from "./NotificationListScreen";
import NotificationPreferencesScreen from "./NotificationPreferencesScreen";
import PromotionsScreen from "./PromotionsScreen";
import { Segmented, styles, useLayout } from "./ui";

type Section = "inbox" | "promotions" | "settings";

/** Entry point of the notifications tab: inbox, promotions and preferences. */
export default function NotificationsHome(): React.JSX.Element {
  const [section, setSection] = useState<Section>("inbox");
  const { gutter } = useLayout();
  return (
    <View style={styles.screen}>
      <View style={{ paddingHorizontal: gutter }}>
        <Segmented<Section>
          label="Mục thông báo"
          value={section}
          onChange={setSection}
          options={[
            { value: "inbox", label: "Thông báo", icon: Bell },
            { value: "promotions", label: "Khuyến mãi", icon: Tag },
            { value: "settings", label: "Cài đặt", icon: Settings },
          ]}
        />
      </View>
      <View style={{ flex: 1 }}>
        {section === "inbox" && <NotificationListScreen />}
        {section === "promotions" && <PromotionsScreen />}
        {section === "settings" && <NotificationPreferencesScreen />}
      </View>
    </View>
  );
}
