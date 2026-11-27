import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Camera, ImagePlus, Images, Sparkles, X } from "lucide-react-native";
import { AppIcon, IconButton, radius, spacing, textStyles, touchTarget } from "../../theme";
import { SegmentTabs } from "../../components/SegmentTabs";
import { useSession } from "../../services/session";
import { colors } from "../notifications/ui";
import { pickCatalogPhoto } from "../inventory/inventoryPhoto";
import type { UploadPhoto } from "../inventory/inventoryApi";
import { suggestFromPhoto } from "./adminMedia";
import { CREATE_KIND_OPTIONS, recognitionOutcome, type CreateKind, type IngredientSuggestion, type RecipeSuggestion } from "./photoCreate";

/** What the create form receives: the photo (attached as the item image), the AI suggestion if any, and a note. */
export type CreateRequest = {
  key: number;
  kind: CreateKind;
  photo: UploadPhoto;
  ingredient: IngredientSuggestion | null;
  recipe: RecipeSuggestion | null;
  note: string | null;
};

type Props = { visible: boolean; onClose: () => void; onReady: (request: Omit<CreateRequest, "key">) => void };

/**
 * Quản trị › "Chụp ảnh" (bottom bar): create a NEW ingredient or dish from a photo. Camera or library → preview →
 * "Nguyên liệu" / "Món ăn" → "Đang nhận diện…" → the existing create form opens prefilled (the admin reviews and
 * saves). When recognition is off or fails, the empty form opens with the photo attached.
 */
export default function AdminCreateFromPhoto({ visible, onClose, onReady }: Props): React.JSX.Element {
  const { accessToken } = useSession();
  const [photo, setPhoto] = useState<UploadPhoto | null>(null);
  const [kind, setKind] = useState<CreateKind>("ingredient");
  const [picking, setPicking] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (visible) { setPhoto(null); setKind("ingredient"); setError(null); setRecognizing(false); } }, [visible]);

  const pick = async (source: "camera" | "library") => {
    setPicking(true); setError(null);
    const result = await pickCatalogPhoto(source);
    setPicking(false);
    if (result.status === "picked") setPhoto(result.photo);
    else if (result.status === "denied") setError(source === "camera" ? "Cần quyền dùng camera để chụp ảnh." : "Cần quyền truy cập ảnh để chọn ảnh.");
    else if (result.status === "error") setError(result.message);
  };

  const recognize = async () => {
    if (!photo || !accessToken) return;
    setRecognizing(true);
    const result = await suggestFromPhoto(accessToken, kind, photo);
    const outcome = recognitionOutcome(result.status === 0 ? null : result);
    setRecognizing(false);
    onReady({
      kind, photo,
      ingredient: outcome.prefill && "kind" in result && result.kind === "ingredient" ? result.suggestion : null,
      recipe: outcome.prefill && "kind" in result && result.kind === "recipe" ? result.suggestion : null,
      note: outcome.note,
    });
  };

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={local.screen} edges={["top", "bottom", "left", "right"]}>
        <View style={local.topBar}>
          <IconButton icon={X} accessibilityLabel="Đóng" onPress={onClose} disabled={recognizing} />
          <Text style={local.topTitle} accessibilityRole="header">Tạo mới từ ảnh</Text>
          <View style={local.spacer} />
        </View>
        <ScrollView contentContainerStyle={local.content} keyboardShouldPersistTaps="handled">
          {error ? <Text style={local.error} accessibilityRole="alert">{error}</Text> : null}
          {!photo ? (
            <View style={local.start}>
              <View style={local.startIcon}><AppIcon icon={ImagePlus} size="xl" color={colors.primary} /></View>
              <Text style={local.title}>Chụp nguyên liệu hoặc món ăn</Text>
              <Text style={local.meta}>AI gợi ý thông tin, bạn kiểm tra rồi mới lưu.</Text>
              <Pressable accessibilityRole="button" disabled={picking} onPress={() => void pick("camera")} style={({ pressed }) => [local.primary, pressed && local.pressed]}>
                {picking ? <ActivityIndicator color={colors.primaryText} /> : <AppIcon icon={Camera} size="sm" color={colors.primaryText} />}
                <Text style={local.primaryText}>Chụp ảnh</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={picking} onPress={() => void pick("library")} style={({ pressed }) => [local.secondary, pressed && local.pressed]}>
                <AppIcon icon={Images} size="sm" color={colors.primary} />
                <Text style={local.secondaryText}>Chọn từ thư viện</Text>
              </Pressable>
            </View>
          ) : (
            <View style={local.preview}>
              <Image source={{ uri: photo.uri }} style={local.previewImage} accessibilityLabel="Ảnh vừa chọn" resizeMode="cover" />
              <Text style={local.label}>Đây là</Text>
              <SegmentTabs options={CREATE_KIND_OPTIONS} value={kind} onChange={setKind} />
              {recognizing ? (
                <View style={local.recognizing} accessibilityLiveRegion="polite">
                  <ActivityIndicator color={colors.primary} />
                  <Text style={local.meta}>Đang nhận diện…</Text>
                </View>
              ) : (
                <>
                  <Pressable accessibilityRole="button" onPress={() => void recognize()} style={({ pressed }) => [local.primary, pressed && local.pressed]}>
                    <AppIcon icon={Sparkles} size="sm" color={colors.primaryText} />
                    <Text style={local.primaryText}>Nhận diện và mở mẫu tạo mới</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => setPhoto(null)} style={local.link}><Text style={local.linkText}>Chụp lại</Text></Pressable>
                </>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const local = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  topBar: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  topTitle: { ...textStyles.subheading, flex: 1, textAlign: "center" },
  spacer: { width: touchTarget },
  content: { alignSelf: "center", flexGrow: 1, gap: spacing.md, maxWidth: 520, padding: spacing.lg, width: "100%" },
  error: { ...textStyles.bodySmall, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, color: colors.danger, padding: spacing.md },
  start: { alignItems: "center", flex: 1, gap: spacing.md, justifyContent: "center", paddingVertical: spacing.xl },
  startIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 40, height: 80, justifyContent: "center", width: 80 },
  title: { ...textStyles.subheading, textAlign: "center" },
  meta: { ...textStyles.bodySmall, color: colors.muted, textAlign: "center" },
  label: { ...textStyles.label },
  primary: { alignItems: "center", alignSelf: "stretch", backgroundColor: colors.primary, borderRadius: radius.sm, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: 48 },
  primaryText: { ...textStyles.label, color: colors.primaryText },
  secondary: { alignItems: "center", alignSelf: "stretch", borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: 48 },
  secondaryText: { ...textStyles.label, color: colors.primary },
  pressed: { opacity: 0.8 },
  preview: { gap: spacing.md },
  previewImage: { alignSelf: "center", aspectRatio: 1, backgroundColor: colors.border, borderRadius: radius.md, maxWidth: 320, width: "100%" },
  recognizing: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 48 },
  link: { alignItems: "center", minHeight: touchTarget, justifyContent: "center" },
  linkText: { ...textStyles.labelSmall, color: colors.primary },
});
