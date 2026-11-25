import React, { useState } from "react";
import { View } from "react-native";
import NotificationFeed from "./NotificationFeed";
import WeekShoppingScreen from "./WeekShoppingScreen";
import { styles } from "./ui";

type Props = {
  /** An expiry alert was tapped: open Kho with that item's edit dialog. */
  onOpenInventoryItem?: (itemId: string) => void;
  /** Refresh the tab badge after the list loaded or a notification was read. */
  onChanged?: () => void;
  /** Open Đi chợ on Giỏ hàng (after "Thêm vào Giỏ hàng" in "Cần mua tuần này"). */
  onOpenCart?: () => void;
};

/**
 * The "Thông báo" tab: one list (notifications, expiry alerts, active promotions). No page title, no segments and
 * no read filter; notification settings live in Hồ sơ > "Cài đặt thông báo".
 */
export default function NotificationsHome({ onOpenInventoryItem, onChanged, onOpenCart }: Props): React.JSX.Element {
  const [weekOpen, setWeekOpen] = useState(false);
  if (weekOpen) return <WeekShoppingScreen onBack={() => setWeekOpen(false)} onOpenCart={() => { setWeekOpen(false); onOpenCart?.(); }} />;
  return (
    <View style={styles.screen}>
      <NotificationFeed onOpenInventoryItem={onOpenInventoryItem} onChanged={onChanged} onOpenWeekShopping={() => setWeekOpen(true)} />
    </View>
  );
}
