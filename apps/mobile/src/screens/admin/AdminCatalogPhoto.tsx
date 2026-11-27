import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { File } from "expo-file-system";
import { Camera, CircleCheck, ImagePlus, Images, Search, X } from "lucide-react-native";
import { AppIcon, IconButton, radius, spacing, textStyles, touchTarget } from "../../theme";
import { useConfirm } from "../../components/ConfirmDialog";
import { ApiError, gatewayFetch } from "../../services/api";
import { useSession } from "../../services/session";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { errorMessage } from "../notifications/gatewayApi";
import { colors, RemoteImage, ScreenState } from "../notifications/ui";
import { pickCatalogPhoto } from "../inventory/inventoryPhoto";
import { appendPhoto, photoUploadErrorMessage } from "../inventory/photoUpload";
import type { UploadPhoto } from "../inventory/inventoryApi";
import { hasImage, missingImageCount, missingImageText, photoPickerOrder, uploadConfirm, type CatalogProduct } from "./catalogPhoto";

/** POST /api/admin/ingredients/:id/image (multipart, field "photo"); admin-service re-encodes and stores it. */
async function uploadCatalogImage(accessToken: string, productId: string, photo: UploadPhoto): Promise<void> {
  const form = new FormData();
  await appendPhoto(form, photo, { isWeb: Platform.OS === "web", readBytes: (uri) => new File(uri).bytes() });
  const response = await gatewayFetch(`/api/admin/ingredients/${encodeURIComponent(productId)}/image`, { method: "POST", body: form, accessToken, timeoutMs: 60_000 });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new ApiError(body.message ?? `HTTP ${response.status}`, response.status, undefined, body.error);
  }
}

type Props = { visible: boolean; onClose: () => void };

/**
 * Quản trị › "Chụp ảnh": take or choose a photo (square, ≤ 1024 px JPEG), then pick the catalog ingredient it shows —
 * products without an image first, "Còn N nguyên liệu chưa có ảnh" on top — confirm (a replacement asks first), and
 * upload. Users see the new image in Đi chợ and Kho (served by the gateway).
 */
export default function AdminCatalogPhoto({ visible, onClose }: Props): React.JSX.Element {
  const { api } = useGatewayApi();
  const { accessToken } = useSession();
  const [photo, setPhoto] = useState<UploadPhoto | null>(null);
  const [picking, setPicking] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const loadProducts = useCallback(async () => {
    setLoadError(null);
    try {
      // Every catalog row (hidden ones too): admin-only export.
      const rows = await api.get<Array<{ id: string; name: string; category: string; imageUrl: string | null; isActive: boolean }>>("/api/admin/ingredients/export");
      setProducts(rows.map((row) => ({ id: row.id, name: row.name, category: row.category, imageUrl: row.imageUrl, isActive: row.isActive })));
    } catch (caught) {
      setLoadError(errorMessage(caught));
    }
  }, [api]);

  useEffect(() => {
    if (!visible) return;
    setPhoto(null); setSearch(""); setError(null); setDone(null); setBusyId(null);
    void loadProducts();
  }, [visible, loadProducts]);

  const pick = async (source: "camera" | "library") => {
    setPicking(true); setError(null); setDone(null);
    const result = await pickCatalogPhoto(source);
    setPicking(false);
    if (result.status === "picked") setPhoto(result.photo);
    else if (result.status === "denied") setError(source === "camera" ? "Cần quyền dùng camera để chụp ảnh." : "Cần quyền truy cập ảnh để chọn ảnh.");
    else if (result.status === "error") setError(result.message);
  };

  const choose = useCallback(async (product: CatalogProduct) => {
    if (!photo || !accessToken || busyId) return;
    const ok = await confirm(uploadConfirm(product));
    if (!ok) return;
    setBusyId(product.id); setError(null);
    try {
      await uploadCatalogImage(accessToken, product.id, photo);
      setDone(`Đã đặt ảnh cho ${product.name}.`);
      setPhoto(null);
      await loadProducts();
    } catch (caught) {
      setError(photoUploadErrorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }, [photo, accessToken, busyId, confirm, loadProducts]);

  const ordered = useMemo(() => photoPickerOrder(products ?? [], search), [products, search]);
  const missing = missingImageCount(products ?? []);

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={local.screen} edges={["top", "bottom", "left", "right"]}>
        <View style={local.topBar}>
          <IconButton icon={X} accessibilityLabel="Đóng" onPress={onClose} />
          <Text style={local.topTitle} accessibilityRole="header">Ảnh nguyên liệu</Text>
          <View style={local.spacer} />
        </View>
        {done ? (
          <View style={local.notice} accessibilityLiveRegion="polite">
            <AppIcon icon={CircleCheck} size="sm" color={colors.success} />
            <Text style={local.noticeText}>{done}</Text>
          </View>
        ) : null}
        {error ? <Text style={local.error} accessibilityRole="alert">{error}</Text> : null}
        {!photo ? (
          <View style={local.start}>
            <View style={local.startIcon}><AppIcon icon={ImagePlus} size="xl" color={colors.primary} /></View>
            <Text style={local.startTitle}>Chụp hoặc chọn ảnh nguyên liệu</Text>
            <Text style={local.meta}>{products ? missingImageText(missing) : " "}</Text>
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
          <FlatList
            data={products ? ordered : []}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={local.listContent}
            initialNumToRender={14}
            ListHeaderComponent={(
              <View style={local.header}>
                <View style={local.previewRow}>
                  <Image source={{ uri: photo.uri }} style={local.preview} accessibilityLabel="Ảnh vừa chọn" />
                  <View style={local.flex}>
                    <Text style={local.label}>Ảnh này là nguyên liệu nào?</Text>
                    <Text style={local.meta}>{missingImageText(missing)}</Text>
                    <Pressable accessibilityRole="button" onPress={() => setPhoto(null)} hitSlop={8}><Text style={local.link}>Chụp lại</Text></Pressable>
                  </View>
                </View>
                <View style={local.search}>
                  <AppIcon icon={Search} size="sm" color={colors.muted} />
                  <TextInput accessibilityLabel="Tìm nguyên liệu" value={search} onChangeText={setSearch} placeholder="Tìm nguyên liệu" placeholderTextColor={colors.muted} style={local.searchInput} />
                </View>
              </View>
            )}
            ListEmptyComponent={<ScreenState loading={!products && !loadError} error={loadError} onRetry={() => void loadProducts()} empty={Boolean(products)} emptyText="Không có nguyên liệu phù hợp." />}
            renderItem={({ item }) => <ProductRow product={item} busy={busyId === item.id} disabled={busyId !== null} onChoose={choose} />}
          />
        )}
        {dialog}
      </SafeAreaView>
    </Modal>
  );
}

const ProductRow = memo(function ProductRow({ product, busy, disabled, onChoose }: { product: CatalogProduct; busy: boolean; disabled: boolean; onChoose: (product: CatalogProduct) => void }): React.JSX.Element {
  const withImage = hasImage(product);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${product.name}, ${withImage ? "đã có ảnh" : "chưa có ảnh"}`} disabled={disabled} onPress={() => onChoose(product)}
      style={({ pressed }) => [local.row, !product.isActive && local.dimmed, pressed && local.pressed]}>
      <RemoteImage uri={product.imageUrl} size={44} />
      <View style={local.flex}>
        <Text style={local.label} numberOfLines={1}>{product.name}</Text>
        <Text style={local.meta} numberOfLines={1}>{product.category}{withImage ? " · Đã có ảnh" : ""}</Text>
      </View>
      {busy ? <ActivityIndicator color={colors.primary} /> : !withImage ? <View style={local.badge}><Text style={local.badgeText}>Chưa có ảnh</Text></View> : null}
    </Pressable>
  );
});

const local = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  topBar: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  topTitle: { ...textStyles.subheading, flex: 1, textAlign: "center" },
  spacer: { width: touchTarget },
  notice: { alignItems: "center", backgroundColor: colors.successSoft, flexDirection: "row", gap: spacing.xs, margin: spacing.lg, marginBottom: 0, borderRadius: radius.sm, padding: spacing.md },
  noticeText: { ...textStyles.bodySmall, color: colors.success, flex: 1 },
  error: { ...textStyles.bodySmall, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, color: colors.danger, margin: spacing.lg, marginBottom: 0, padding: spacing.md },
  start: { alignItems: "center", alignSelf: "center", flex: 1, gap: spacing.md, justifyContent: "center", maxWidth: 420, padding: spacing.xl, width: "100%" },
  startIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 40, height: 80, justifyContent: "center", width: 80 },
  startTitle: { ...textStyles.subheading, textAlign: "center" },
  primary: { alignItems: "center", alignSelf: "stretch", backgroundColor: colors.primary, borderRadius: radius.sm, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: 48 },
  primaryText: { ...textStyles.label, color: colors.primaryText },
  secondary: { alignItems: "center", alignSelf: "stretch", borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: 48 },
  secondaryText: { ...textStyles.label, color: colors.primary },
  pressed: { opacity: 0.8 },
  listContent: { alignSelf: "center", maxWidth: 720, paddingBottom: spacing.xl, width: "100%" },
  header: { gap: spacing.md, padding: spacing.lg },
  previewRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  preview: { backgroundColor: colors.border, borderRadius: radius.md, height: 88, width: 88 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  label: { ...textStyles.label },
  meta: { ...textStyles.bodySmall, color: colors.muted },
  link: { ...textStyles.labelSmall, color: colors.primary, marginTop: spacing.xs },
  search: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: touchTarget, paddingHorizontal: spacing.md },
  searchInput: { ...textStyles.body, flex: 1, minHeight: touchTarget - 2, padding: 0 },
  row: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.md, minHeight: 60, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  dimmed: { opacity: 0.6 },
  badge: { backgroundColor: colors.warningSoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { ...textStyles.caption, color: colors.warning, fontWeight: "700" },
});
