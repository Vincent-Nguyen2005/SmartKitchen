import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Camera, ImagePlus, Trash2 } from "lucide-react-native";
import { AppIcon, colors, fontFamily, radius, spacing, textStyles, touchTarget, typography } from "../../theme";
import { useSession } from "../../services/session";
import UserAvatar from "../../components/UserAvatar";
import { inventoryApi } from "../inventory/inventoryApi";
import { CAMERA_PERMISSION_TEXT, LIBRARY_PERMISSION_TEXT, pickAvatarPhoto } from "../inventory/inventoryPhoto";
import { nameProblem } from "./profileName";

/** Typing pause after which the name saves itself (it also saves on blur / "done"). */
const NAME_SAVE_DELAY_MS = 1200;
type NameState = "idle" | "saving" | "saved" | "error";

/**
 * Hồ sơ header: the avatar (Chụp ảnh / Chọn ảnh / Xóa ảnh; stored like Kho photos) and the display name, edited in
 * place and saved by itself like the rest of Hồ sơ (no save button).
 */
export default function ProfileHeader(): React.JSX.Element | null {
  const { user, accessToken, updateProfile } = useSession();
  const [name, setName] = useState(user?.fullName ?? "");
  const [nameState, setNameState] = useState<NameState>("idle");
  const [nameError, setNameError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedName = useRef(user?.fullName ?? "");

  // Another device / a fresh sign-in changed the name: show it unless the user is typing a different one.
  useEffect(() => {
    if (nameState !== "saving" && (user?.fullName ?? "") !== savedName.current) {
      savedName.current = user?.fullName ?? "";
      setName(savedName.current);
    }
  }, [user?.fullName, nameState]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!user) return null;

  const saveName = async (value: string) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const trimmed = value.trim();
    const problem = nameProblem(value);
    setNameError(problem);
    if (problem || trimmed === savedName.current.trim()) return;
    setNameState("saving");
    try {
      await updateProfile({ fullName: trimmed });
      savedName.current = trimmed;
      setNameState("saved");
    } catch (error) {
      setNameState("error");
      setNameError(error instanceof Error ? error.message : "Chưa lưu được tên. Thử lại nhé.");
    }
  };
  const onChangeName = (value: string) => {
    setName(value);
    setNameState("idle");
    setNameError(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveName(value), NAME_SAVE_DELAY_MS);
  };

  const changePhoto = async (source: "camera" | "library") => {
    if (!accessToken) return;
    setPhotoError(null);
    const result = await pickAvatarPhoto(source);
    if (result.status === "cancelled") return;
    if (result.status === "denied") {
      setPhotoError(`${source === "camera" ? CAMERA_PERMISSION_TEXT : LIBRARY_PERMISSION_TEXT} (bật trong Cài đặt của máy).`);
      return;
    }
    if (result.status === "error") { setPhotoError(result.message); return; }
    setPhotoBusy(true);
    try {
      const uploaded = await inventoryApi.uploadAvatar(accessToken, result.photo);
      await updateProfile({ avatarUrl: uploaded.avatarUrl });
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Chưa tải được ảnh. Kiểm tra mạng rồi thử lại.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    if (!accessToken) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      await updateProfile({ avatarUrl: null });
      // The file is removed after the profile no longer points to it (a failure only leaves an unused file).
      await inventoryApi.deleteAvatar(accessToken).catch(() => undefined);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Chưa xóa được ảnh. Thử lại nhé.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const displayName = name.trim() || user.email.split("@")[0];
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View>
          <UserAvatar name={displayName} avatarUrl={user.avatarUrl} size={72} accessibilityLabel="Ảnh đại diện của bạn" />
          {photoBusy && <View style={styles.busy}><ActivityIndicator color={colors.primary} /></View>}
        </View>
        <View style={styles.nameBlock}>
          <Text style={styles.label}>Họ tên</Text>
          <TextInput
            accessibilityLabel="Họ tên"
            value={name}
            onChangeText={onChangeName}
            onBlur={() => void saveName(name)}
            onSubmitEditing={() => void saveName(name)}
            placeholder="Nhập họ tên"
            placeholderTextColor={colors.muted}
            maxLength={60}
            returnKeyType="done"
            style={[styles.input, nameError && styles.inputError]}
          />
          <Text accessibilityLiveRegion="polite" style={[styles.status, nameError && styles.error]}>
            {nameError ?? (nameState === "saving" ? "Đang lưu..." : nameState === "saved" ? "Đã lưu" : "Tự lưu khi bạn sửa")}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Chụp ảnh đại diện" disabled={photoBusy} onPress={() => void changePhoto("camera")} style={[styles.action, photoBusy && styles.dimmed]}>
          <AppIcon icon={Camera} size="sm" color={colors.primary} />
          <Text style={styles.actionText}>Chụp ảnh</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Chọn ảnh đại diện từ thư viện" disabled={photoBusy} onPress={() => void changePhoto("library")} style={[styles.action, photoBusy && styles.dimmed]}>
          <AppIcon icon={ImagePlus} size="sm" color={colors.primary} />
          <Text style={styles.actionText}>Chọn ảnh</Text>
        </Pressable>
        {!!user.avatarUrl && (
          <Pressable accessibilityRole="button" accessibilityLabel="Xóa ảnh đại diện" disabled={photoBusy} onPress={() => void removePhoto()} style={[styles.action, photoBusy && styles.dimmed]}>
            <AppIcon icon={Trash2} size="sm" color={colors.danger} />
            <Text style={styles.removeText}>Xóa ảnh</Text>
          </Pressable>
        )}
      </View>
      {photoError && <Text accessibilityRole="alert" style={styles.error}>{photoError}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, marginBottom: spacing.sm },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  busy: { alignItems: "center", backgroundColor: colors.overlay, borderRadius: 36, bottom: 0, justifyContent: "center", left: 0, position: "absolute", right: 0, top: 0 },
  nameBlock: { flex: 1, gap: spacing.xs },
  label: { ...textStyles.labelSmall, color: colors.muted },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.text, fontFamily, fontSize: typography.body.fontSize, minHeight: touchTarget, paddingHorizontal: spacing.md },
  inputError: { borderColor: colors.danger },
  status: { ...textStyles.caption, color: colors.muted },
  error: { ...textStyles.caption, color: colors.danger },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { alignItems: "center", borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", gap: spacing.xs, minHeight: touchTarget, paddingHorizontal: spacing.md },
  actionText: { ...textStyles.labelSmall, color: colors.primary },
  removeText: { ...textStyles.labelSmall, color: colors.danger },
  dimmed: { opacity: 0.6 },
});
