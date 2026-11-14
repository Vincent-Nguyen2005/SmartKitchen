import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ArrowLeft, ChevronRight, House } from "lucide-react-native";
import { AppIcon, AppText, colors, IconButton, radius, spacing, touchTarget } from "../../theme";
import { Badge } from "../notifications/ui";
import { displayName, initial, userRoleBadge, type AdminFamilySummary, type AdminUser } from "./directoryApi";

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

type FamilyRowProps = { family: AdminFamilySummary; onPress: () => void };

/** One family: house icon, name (body 16), member count (caption 12); opens the family detail. */
export function FamilyRow({ family, onPress }: FamilyRowProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${family.name}, ${family.memberCount} thành viên`}
      accessibilityHint="Mở chi tiết gia đình"
      onPress={onPress}
      style={({ pressed }) => [local.row, pressed && local.pressed]}
    >
      <AppIcon icon={House} size="md" color={colors.primary} />
      <View style={local.text}>
        <AppText variant="body" numberOfLines={1}>{family.name}</AppText>
        <AppText variant="caption">{family.memberCount} thành viên</AppText>
      </View>
      <AppIcon icon={ChevronRight} size="sm" color={colors.muted} />
    </Pressable>
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
  pressed: { backgroundColor: colors.primarySoft },
  text: { flex: 1, minWidth: 0 },
});
