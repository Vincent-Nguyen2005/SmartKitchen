import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { typography } from "../../theme";

type Props = { name?: string | null; avatarUrl?: string | null };

export default function MemberAvatar({ name, avatarUrl }: Props): React.JSX.Element {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = !!avatarUrl && failedUrl !== avatarUrl;

  return (
    <View style={styles.avatar}>
      {showImage ? (
        <Image source={{ uri: avatarUrl }} style={styles.image} accessibilityLabel={`Ảnh đại diện của ${name || "thành viên"}`} onError={() => setFailedUrl(avatarUrl)} />
      ) : (
        <Text style={styles.avatarText}>{name?.trim().charAt(0).toUpperCase() || "?"}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", backgroundColor: "#E4F0E9", borderRadius: 20, height: 40, justifyContent: "center", marginRight: 12, overflow: "hidden", width: 40 },
  image: { height: 40, width: 40 },
  avatarText: { color: "#2F6B5F", fontSize: typography.body.fontSize, fontWeight: "700" },
});
