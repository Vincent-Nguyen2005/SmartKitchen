import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, textStyles } from "../theme";
import { useSession } from "../services/session";
import { InventoryPhoto } from "../screens/inventory/inventoryPhoto";
import { initialsOf } from "../screens/profile/profileName";

type Props = { name?: string | null; avatarUrl?: string | null; size?: number; accessibilityLabel?: string };

/**
 * A user's avatar: their uploaded photo (Hồ sơ; stored like Kho photos, so the request carries the access token),
 * else a circle with their initials in the theme colours.
 */
export default function UserAvatar({ name, avatarUrl, size = 40, accessibilityLabel }: Props): React.JSX.Element {
  const { accessToken } = useSession();
  const circle = { borderRadius: size / 2, height: size, width: size };
  const label = accessibilityLabel ?? `Ảnh đại diện của ${name?.trim() || "thành viên"}`;
  const initials = (
    <View accessibilityLabel={label} style={[styles.initials, circle]}>
      <Text style={[styles.initialsText, { fontSize: Math.max(12, Math.round(size * 0.38)), lineHeight: Math.max(16, Math.round(size * 0.5)) }]}>{initialsOf(name)}</Text>
    </View>
  );
  return (
    <View style={[styles.frame, circle]}>
      <InventoryPhoto imageUrl={avatarUrl} accessToken={accessToken} accessibilityLabel={label} style={circle} placeholder={initials} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden" },
  initials: { alignItems: "center", backgroundColor: colors.primarySoft, justifyContent: "center" },
  initialsText: { ...textStyles.label, color: colors.primary, fontWeight: "700" },
});
