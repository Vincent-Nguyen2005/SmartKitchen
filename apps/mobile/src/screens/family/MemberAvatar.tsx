import React from "react";
import { StyleSheet, View } from "react-native";
import UserAvatar from "../../components/UserAvatar";

type Props = { name?: string | null; avatarUrl?: string | null };

/** Gia đình member lists: the member's Hồ sơ avatar, or their initials. */
export default function MemberAvatar({ name, avatarUrl }: Props): React.JSX.Element {
  return (
    <View style={styles.spacing}>
      <UserAvatar name={name} avatarUrl={avatarUrl} size={40} />
    </View>
  );
}

const styles = StyleSheet.create({ spacing: { marginRight: 12 } });
