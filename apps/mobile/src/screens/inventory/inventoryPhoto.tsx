import React, { useEffect, useState } from "react";
import { Image, Platform, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Package } from "lucide-react-native";
import { AppIcon, colors } from "../../theme";
import { photoRequest, type ReceiptMimeType, type UploadPhoto } from "./inventoryApi";

export const MAX_UPLOAD_EDGE = 1280;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** A problem with the picked image itself; its message is shown to the user. */
class PhotoPrepareError extends Error {}

type PickedAsset = { uri: string; mimeType?: string | null; fileName?: string | null; fileSize?: number | null };

const mimeFrom = (asset: PickedAsset): ReceiptMimeType | null => {
  const reported = asset.mimeType?.toLowerCase();
  if (reported) return (["image/jpeg", "image/png", "image/webp"] as const).find((type) => type === reported) ?? null;
  const extension = (asset.fileName ?? asset.uri).split(/[?#]/)[0].match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  return extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
};

/** Web: redraw on a canvas no larger than MAX_UPLOAD_EDGE and re-encode as JPEG (also drops EXIF). */
const downscaleOnWeb = (uri: string): Promise<Blob> => new Promise((resolve, reject) => {
  const image = new window.Image();
  image.onload = () => {
    const scale = Math.min(1, MAX_UPLOAD_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
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

/**
 * Turns a picked or captured image into an upload. Web downscales to MAX_UPLOAD_EDGE here; native sends the
 * picker's compressed JPEG and the server re-encodes it to 1024 px (on-device resize needs expo-image-manipulator).
 */
export async function prepareUploadPhoto(asset: PickedAsset): Promise<UploadPhoto> {
  const mimeType = mimeFrom(asset);
  if (!mimeType) throw new PhotoPrepareError("Ảnh cần ở định dạng JPEG, PNG hoặc WebP.");
  if (Platform.OS === "web") {
    const blob = await downscaleOnWeb(asset.uri);
    if (blob.size > MAX_UPLOAD_BYTES) throw new PhotoPrepareError("Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn 5 MB.");
    return { uri: URL.createObjectURL(blob), blob, mimeType: "image/jpeg", name: "photo.jpg" };
  }
  if (asset.fileSize && asset.fileSize > MAX_UPLOAD_BYTES) throw new PhotoPrepareError("Ảnh quá lớn. Hãy chụp lại hoặc chọn ảnh nhỏ hơn 5 MB.");
  return { uri: asset.uri, mimeType, name: mimeType === "image/png" ? "photo.png" : mimeType === "image/webp" ? "photo.webp" : "photo.jpg" };
}

export type PhotoPickResult =
  | { status: "picked"; photo: UploadPhoto }
  | { status: "cancelled" }
  | { status: "denied" }
  | { status: "error"; message: string };

/** Camera on phones, photo library on web (and when `source` is "library"). */
export async function pickItemPhoto(source: "camera" | "library"): Promise<PhotoPickResult> {
  try {
    const useCamera = source === "camera" && Platform.OS !== "web";
    if (useCamera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return { status: "denied" };
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7, exif: false };
    const result = useCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return { status: "cancelled" };
    return { status: "picked", photo: await prepareUploadPhoto(result.assets[0]) };
  } catch (error) {
    return { status: "error", message: error instanceof PhotoPrepareError ? error.message : "Không mở được camera hoặc thư viện ảnh. Hãy thử lại." };
  }
}

type PhotoProps = {
  imageUrl?: string | null;
  accessToken: string | null;
  style?: StyleProp<ViewStyle>;
  placeholderStyle?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
};

/**
 * Item photo or a placeholder. Uploaded photos are family-only, so the request carries the access token:
 * native Image sends headers itself; web Image cannot, so the bytes are fetched and shown from a blob URL.
 */
export function InventoryPhoto({ imageUrl, accessToken, style, placeholderStyle, accessibilityLabel }: PhotoProps): React.JSX.Element {
  const [webUri, setWebUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const source = imageUrl ? photoRequest(imageUrl, accessToken) : null;
  const needsWebFetch = Platform.OS === "web" && !!source?.headers;

  useEffect(() => {
    setFailed(false);
    setWebUri(null);
    if (!needsWebFetch || !source) return;
    let objectUrl: string | null = null;
    let active = true;
    fetch(source.uri, { headers: source.headers })
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setWebUri(objectUrl);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageUrl, accessToken, needsWebFetch]);

  const uri = needsWebFetch ? webUri : source?.uri;
  if (!source || failed || !uri) {
    return (
      <View accessibilityLabel={imageUrl && !failed ? "Đang tải ảnh" : "Chưa có ảnh"} style={[styles.placeholder, style, placeholderStyle]}>
        <AppIcon icon={Package} size="lg" color={colors.primary} />
      </View>
    );
  }
  return (
    <Image
      accessibilityLabel={accessibilityLabel}
      source={needsWebFetch ? { uri } : { uri, headers: source.headers }}
      onError={() => setFailed(true)}
      resizeMode="cover"
      style={[styles.image, style as StyleProp<ImageStyle>]}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 6, justifyContent: "center", overflow: "hidden" },
  image: { backgroundColor: colors.primarySoft, borderRadius: 6 },
});
