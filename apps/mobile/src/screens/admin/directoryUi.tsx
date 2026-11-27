import React from "react";
import { StyleSheet, View } from "react-native";
import { House } from "lucide-react-native";
import { AppIcon, AppText, colors, radius, spacing, touchTarget } from "../../theme";
import { Badge } from "../notifications/ui";
import { displayName, initial, userRoleBadge, type AdminFamilySummary, type AdminUser } from "./directoryApi";
import { familyFacts } from "./familyView";

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
      {/* Fixed-width column: every row's role badge lines up. */}
      <View style={local.badgeColumn}>
        <Badge label={badge.label} color={badge.color} background={badge.background} />
      </View>
    </View>
  );
}

type FamilyRowProps = { family: AdminFamilySummary };

/** One family: house icon, name (body 16), "<n> thành viên · Tạo ngày dd/MM/yyyy" (caption 12). Not tappable: that is all an admin sees. */
export function FamilyRow({ family }: FamilyRowProps): React.JSX.Element {
  return (
    <View style={local.row} accessible accessibilityLabel={`${family.name}, ${familyFacts(family)}`}>
      <AppIcon icon={House} size="md" color={colors.primary} />
      <View style={local.text}>
        <AppText variant="body" numberOfLines={1}>{family.name}</AppText>
        <AppText variant="caption">{familyFacts(family)}</AppText>
      </View>
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
  row: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: touchTarget, paddingVertical: spacing.sm },
  text: { flex: 1, minWidth: 0 },
  badgeColumn: { alignItems: "flex-end", minWidth: 112 },
});
