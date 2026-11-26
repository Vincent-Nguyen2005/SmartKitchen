import React, { useState } from "react";
import { View } from "react-native";
import NotificationFeed from "./NotificationFeed";
import GreetingCard from "./GreetingCard";
import type { GreetingMeal } from "./greeting";
import WeekShoppingScreen from "./WeekShoppingScreen";
import { styles } from "./ui";

type Props = {
  /** An expiry alert was tapped: open Kho with that item's edit dialog. */
  onOpenInventoryItem?: (itemId: string) => void;
  /** Refresh the tab badge after the list loaded or a notification was read. */
  onChanged?: () => void;
  /** Open Đi chợ on Giỏ hàng (after "Thêm vào Giỏ hàng" in "Cần mua tuần này"). */
  onOpenCart?: () => void;
  /** The greeting card was tapped: open Lịch on today's meal. */
  onOpenMeal?: (meal: GreetingMeal) => void;
};

/**
 * The "Thông báo" tab: a time-of-day greeting card (in-app only, see GreetingCard), then one list (notifications,
 * expiry alerts, active promotions). No page title, no segments, no read filter and no notification settings: every
 * notification type is shown.
 */
export default function NotificationsHome({ onOpenInventoryItem, onChanged, onOpenCart, onOpenMeal }: Props): React.JSX.Element {
  const [weekOpen, setWeekOpen] = useState(false);
  if (weekOpen) return <WeekShoppingScreen onBack={() => setWeekOpen(false)} onOpenCart={() => { setWeekOpen(false); onOpenCart?.(); }} />;
  return (
    <View style={styles.screen}>
      <GreetingCard onOpenMeal={onOpenMeal} />
      <NotificationFeed onOpenInventoryItem={onOpenInventoryItem} onChanged={onChanged} onOpenWeekShopping={() => setWeekOpen(true)} />
    </View>
  );
}
