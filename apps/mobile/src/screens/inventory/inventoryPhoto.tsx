import React from "react";
import { Platform, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Package } from "lucide-react-native";
import { AppIcon, colors } from "../../theme";
import AuthImage from "../../components/AuthImage";
import { type ReceiptMimeType, type UploadPhoto } from "./inventoryApi";

export const MAX_UPLOAD_EDGE = 1280;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** A problem with the picked image itself; its message is shown to the user. */
class PhotoPrepareError extends Error {}

type PickedAsset = { uri: string; mimeType?: string | null; fileName?: string | null; fileSize?: number | null; width?: number | null; height?: number | null };

const mimeFrom = (asset: PickedAsset): ReceiptMimeType | null => {
  const reported = asset.mimeType?.toLowerCase();
  if (reported) return (["image/jpeg", "image/png", "image/webp"] as const).find((type) => type === reported) ?? null;
  const extension = (asset.fileName ?? asset.uri).split(/[?#]/)[0].match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  return extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
};

/** Hồ sơ avatars: smaller than item photos (the server re-encodes them to the same 512 px). */
export const AVATAR_UPLOAD_EDGE = 512;

/** Web: redraw on a canvas no larger than `maxEdge` and re-encode as JPEG (also drops EXIF). */
const downscaleOnWeb = (uri: string, maxEdge: number): Promise<Blob> => new Promise((resolve, reject) => {
  const image = new window.Image();
  image.onload = () => {
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) { reject(new Error("Canvas unavailable")); return; }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Encode failed"))), "image/jpeg", 0.82);
  };
  image.onerror = () => reject(new Error("Image load failed"));
  image.src = uri;
});

/** Longer edge to `maxEdge` (the other follows the aspect ratio); null = already small enough. */
const resizeFor = (width: number, height: number, maxEdge: number): { width: number } | { height: number } | null => {
  if (Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
};

/** Phones: resize to `maxEdge` and save as JPEG ~0.8 with expo-image-manipulator (also drops EXIF). */
const downscaleOnDevice = async (asset: PickedAsset, maxEdge: number): Promise<string> => {
  let width = asset.width ?? 0;
  let height = asset.height ?? 0;
  if (!width || !height) {
    const probe = await ImageManipulator.manipulate(asset.uri).renderAsync();
    width = probe.width;
    height = probe.height;
  }
  const context = ImageManipulator.manipulate(asset.uri);
  const size = resizeFor(width, height, maxEdge);
  if (size) context.resize(size);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return saved.uri;
};

/**
 * Turns a picked or captured image into an upload: at most `maxEdge` px (default MAX_UPLOAD_EDGE), JPEG ~0.8, on
 * every platform (canvas on web, expo-image-manipulator on phones). The server re-encodes again (1024 / 512 px).
 */
export async function prepareUploadPhoto(asset: PickedAsset, maxEdge = MAX_UPLOAD_EDGE): Promise<UploadPhoto> {
  const mimeType = mimeFrom(asset);
  if (!mimeType) throw new PhotoPrepareError("Ảnh cần ở định dạng JPEG, PNG hoặc WebP.");
  if (Platform.OS === "web") {
    const blob = await downscaleOnWeb(asset.uri, maxEdge);
    if (blob.size > MAX_UPLOAD_BYTES) throw new PhotoPrepareError("Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn 5 MB.");
    return { uri: URL.createObjectURL(blob), blob, mimeType: "image/jpeg", name: "photo.jpg" };
  }
  let uri: string;
  try {
    uri = await downscaleOnDevice(asset, maxEdge);
  } catch {
    throw new PhotoPrepareError("Không xử lý được ảnh. Hãy chụp lại hoặc chọn ảnh khác.");
  }
  return { uri, mimeType: "image/jpeg", name: "photo.jpg" };
}

export type PhotoPickResult =
  | { status: "picked"; photo: UploadPhoto }
  | { status: "cancelled" }
  | { status: "denied" }
  | { status: "error"; message: string };

export const CAMERA_PERMISSION_TEXT = "Cần quyền camera để chụp sản phẩm";

/**
 * Web (localhost testing): a file input with accept="image/*" and capture="environment", so mobile browsers open
 * the rear camera. Must run from a tap; browsers block a programmatic picker otherwise.
 */
const captureOnWeb = (capture: "environment" | "user" | null = "environment", maxEdge = MAX_UPLOAD_EDGE): Promise<PhotoPickResult> => new Promise((resolve) => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  if (capture) input.setAttribute("capture", capture);
  input.style.display = "none";
  let settled = false;
  const finish = (result: PhotoPickResult) => {
    if (settled) return;
    settled = true;
    input.remove();
    resolve(result);
  };
  input.addEventListener("cancel", () => finish({ status: "cancelled" }));
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) { finish({ status: "cancelled" }); return; }
    const uri = URL.createObjectURL(file);
    prepareUploadPhoto({ uri, mimeType: file.type || "image/jpeg", fileName: file.name }, maxEdge)
      .then((photo) => finish({ status: "picked", photo }))
      .catch((error: unknown) => finish({ status: "error", message: error instanceof PhotoPrepareError ? error.message : "Không đọc được ảnh. Hãy chụp lại." }))
      .finally(() => URL.revokeObjectURL(uri));
  });
  document.body.appendChild(input);
  input.click();
});

/** Takes a product photo with the camera only: the system camera on phones, the camera file input on web. */
export async function takeItemPhoto(): Promise<PhotoPickResult> {
  if (Platform.OS === "web") return captureOnWeb();
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: "denied" };
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7, exif: false });
    if (result.canceled || !result.assets[0]) return { status: "cancelled" };
    return { status: "picked", photo: await prepareUploadPhoto(result.assets[0]) };
  } catch (error) {
    return { status: "error", message: error instanceof PhotoPrepareError ? error.message : "Không mở được camera. Hãy thử lại." };
  }
}

export const LIBRARY_PERMISSION_TEXT = "Cần quyền truy cập ảnh để chọn ảnh đại diện";

/**
 * Hồ sơ avatar: the front camera or the photo library, cropped square on phones and resized to AVATAR_UPLOAD_EDGE
 * (JPEG, EXIF dropped). Web: the file input (with the front camera for "camera").
 */
export async function pickAvatarPhoto(source: "camera" | "library"): Promise<PhotoPickResult> {
  if (Platform.OS === "web") return captureOnWeb(source === "camera" ? "user" : null, AVATAR_UPLOAD_EDGE);
  try {
    const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { status: "denied" };
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.8, exif: false, allowsEditing: true, aspect: [1, 1] };
    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.front })
      : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return { status: "cancelled" };
    return { status: "picked", photo: await prepareUploadPhoto(result.assets[0], AVATAR_UPLOAD_EDGE) };
  } catch (error) {
    return { status: "error", message: error instanceof PhotoPrepareError ? error.message : "Không mở được ảnh. Hãy thử lại." };
  }
}

type PhotoProps = {
  imageUrl?: string | null;
  /** Shown only when the item has no photo of its own (the matching catalog product image); display only. */
  fallbackUrl?: string | null;
  accessToken: string | null;
  style?: StyleProp<ViewStyle>;
  placeholderStyle?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  /** Shown instead of the default placeholder when there is no photo (Kho cards use Đi chợ's placeholder). */
  placeholder?: React.ReactElement;
};

/**
 * Item photo or a placeholder. Uploaded photos are family-only, so AuthImage loads them with the access token (and
 * shows the placeholder while loading or if loading fails).
 */
export function InventoryPhoto({ imageUrl: ownUrl, fallbackUrl, accessToken, style, placeholderStyle, accessibilityLabel, placeholder }: PhotoProps): React.JSX.Element {
  // The family's own photo always wins; the catalog image is used only when there is none.
  const imageUrl = ownUrl || fallbackUrl || null;
  const fallback = placeholder ?? (
    <View accessibilityLabel={imageUrl ? "Đang tải ảnh" : "Chưa có ảnh"} style={[styles.placeholder, style, placeholderStyle]}>
      <AppIcon icon={Package} size="lg" color={colors.primary} />
    </View>
  );
  return <AuthImage url={imageUrl} accessToken={accessToken} accessibilityLabel={accessibilityLabel} style={[styles.image, style as StyleProp<ImageStyle>]} fallback={fallback} />;
}

const styles = StyleSheet.create({
  placeholder: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 6, justifyContent: "center", overflow: "hidden" },
  image: { backgroundColor: colors.primarySoft, borderRadius: 6 },
});
