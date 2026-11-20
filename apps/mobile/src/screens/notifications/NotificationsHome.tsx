import React from "react";
import { View } from "react-native";
import NotificationFeed from "./NotificationFeed";
import { styles } from "./ui";

type Props = {
  /** An expiry alert was tapped: open Kho with that item's edit dialog. */
  onOpenInventoryItem?: (itemId: string) => void;
  /** Refresh the tab badge after the list loaded or a notification was read. */
  onChanged?: () => void;
};

/**
 * The "Thông báo" tab: one list (notifications, expiry alerts, active promotions). No page title, no segments and
 * no read filter; notification settings live in Hồ sơ > "Cài đặt thông báo".
 */
export default function NotificationsHome({ onOpenInventoryItem, onChanged }: Props): React.JSX.Element {
  return (
    <View style={styles.screen}>
      <NotificationFeed onOpenInventoryItem={onOpenInventoryItem} onChanged={onChanged} />
    </View>
  );
}
