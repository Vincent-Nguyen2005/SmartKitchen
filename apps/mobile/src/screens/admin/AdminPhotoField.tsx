import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Camera, Images } from "lucide-react-native";
import { AppIcon, radius, spacing, textStyles, touchTarget } from "../../theme";
import { colors, RemoteImage } from "../notifications/ui";
import { pickCatalogPhoto } from "../inventory/inventoryPhoto";
import type { UploadPhoto } from "../inventory/inventoryApi";

type Props = {
  /** The stored image (https link or uploaded gateway path), if any. */
  imageUrl: string | null;
  /** A photo chosen but not uploaded yet (new items: uploaded after "Lưu"). */
  pending: UploadPhoto | null;
  /** Called with the chosen photo; the form decides whether to upload now (existing item) or after saving. */
  onPicked: (photo: UploadPhoto) => void;
  busy?: boolean;
  /** Shown under the buttons (e.g. "Ảnh sẽ được tải lên khi bấm Lưu"). */
  hint?: string | null;
};

/**
 * "Chụp / chọn ảnh" inside the admin ingredient and dish forms: preview (the chosen photo, else the stored image) and
 * two buttons, camera or library (square, ≤ 1024 px JPEG). Errors (no permission, unreadable) appear under it.
 */
export function AdminPhotoField({ imageUrl, pending, onPicked, busy = false, hint }: Props): React.JSX.Element {
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = async (source: "camera" | "library") => {
    setPicking(true); setError(null);
    const result = await pickCatalogPhoto(source);
    setPicking(false);
    if (result.status === "picked") onPicked(result.photo);
    else if (result.status === "denied") setError(source === "camera" ? "Cần quyền dùng camera để chụp ảnh." : "Cần quyền truy cập ảnh để chọn ảnh.");
    else if (result.status === "error") setError(result.message);
  };
  const disabled = picking || busy;
  return (
    <View style={local.wrap}>
      <Text style={local.label}>Ảnh</Text>
      <View style={local.row}>
        {pending ? <Image source={{ uri: pending.uri }} style={local.preview} accessibilityLabel="Ảnh vừa chọn" /> : <RemoteImage uri={imageUrl} size={72} accessibilityLabel="Ảnh hiện tại" />}
        <View style={local.buttons}>
          <Pressable accessibilityRole="button" accessibilityLabel="Chụp ảnh" disabled={disabled} onPress={() => void pick("camera")} style={({ pressed }) => [local.button, disabled && local.disabled, pressed && local.pressed]}>
            {busy ? <ActivityIndicator color={colors.primary} /> : <AppIcon icon={Camera} size="sm" color={colors.primary} />}
            <Text style={local.buttonText}>Chụp ảnh</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Chọn ảnh từ thư viện" disabled={disabled} onPress={() => void pick("library")} style={({ pressed }) => [local.button, disabled && local.disabled, pressed && local.pressed]}>
            <AppIcon icon={Images} size="sm" color={colors.primary} />
            <Text style={local.buttonText}>Chọn ảnh</Text>
          </Pressable>
        </View>
      </View>
      {hint ? <Text style={local.hint}>{hint}</Text> : null}
      {error ? <Text style={local.error} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}

const local = StyleSheet.create({
  wrap: { gap: spacing.xs, marginBottom: 10 },
  label: { ...textStyles.bodySmall, color: colors.muted },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  preview: { backgroundColor: colors.border, borderRadius: radius.sm, height: 72, width: 72 },
  buttons: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  button: { alignItems: "center", borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", gap: spacing.xs, minHeight: touchTarget, paddingHorizontal: spacing.md },
  buttonText: { ...textStyles.labelSmall, color: colors.primary },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  hint: { ...textStyles.caption, color: colors.muted },
  error: { ...textStyles.caption, color: colors.danger },
});
