import React from "react";
import { StyleSheet, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { AppText, colors, IconButton, radius, spacing, touchTarget } from "../../theme";
import { Badge } from "../notifications/ui";
import { displayName, initial, userRoleBadge, type AdminUser } from "./directoryApi";

type AvatarProps = { name: string | null; email: string | null };

/** Initial-letter avatar; decorative (the name next to it is what screen readers read). */
export function Avatar({ name, email }: AvatarProps): React.JSX.Element {
  return (
    <View style={local.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <AppText variant="label" color={colors.primary}>{initial({ name, email })}</AppText>
    </View>
  );
}

type UserRowProps = { user: AdminUser };

/** One user: avatar, full name (body 16), email (caption 12), role badge. */
export function UserRow({ user }: UserRowProps): React.JSX.Element {
  const badge = userRoleBadge[user.role] ?? userRoleBadge.USER;
  const name = displayName(user);
  return (
    <View style={local.row} accessible accessibilityLabel={`${name}, ${user.email}, ${badge.label}`}>
      <Avatar name={user.name} email={user.email} />
      <View style={local.text}>
        <AppText variant="body" numberOfLines={1}>{name}</AppText>
        <AppText variant="caption" numberOfLines={1}>{user.email}</AppText>
      </View>
      <Badge label={badge.label} color={badge.color} background={badge.background} />
    </View>
  );
}

type ScreenHeaderProps = { title: string; onBack: () => void };

/** Back button + screen title (heading 22) for screens pushed on the admin stack. */
export function ScreenHeader({ title, onBack }: ScreenHeaderProps): React.JSX.Element {
  return (
    <View style={local.header}>
      <IconButton icon={ArrowLeft} accessibilityLabel="Quay lại" onPress={onBack} />
      <AppText variant="heading" accessibilityRole="header" numberOfLines={2} style={local.text}>{title}</AppText>
    </View>
  );
}

export const directoryStyles = StyleSheet.create({
  separator: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth },
});

const local = StyleSheet.create({
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    height: touchTarget - 4,
    justifyContent: "center",
    width: touchTarget - 4,
  },
  header: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: touchTarget, paddingVertical: spacing.sm },
  text: { flex: 1, minWidth: 0 },
});
