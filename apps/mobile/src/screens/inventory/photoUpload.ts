/**
 * Builds the multipart body for photo uploads (Kho item photo, Kho photo suggestion, Hồ sơ avatar) and maps upload
 * failures to Vietnamese messages. Kept free of React Native imports so it runs under the plain Node unit tests.
 *
 * Why a part with `bytes`: Expo replaces the global `fetch` with `expo/fetch`, whose FormData encoder accepts strings,
 * Blobs and objects with `bytes()`, but not React Native's `{ uri, name, type }` file object (it throws before any
 * request is sent, which used to surface as the "cannot reach the server" message). The part below carries both:
 * `bytes` for expo/fetch and `uri` for React Native's own fetch (EXPO_PUBLIC_USE_RN_FETCH=1).
 */

/** Same fields as inventoryApi's UploadPhoto (kept structural so this file has no React Native imports). */
export type PhotoForUpload = { uri: string; mimeType: string; name: string; blob?: Blob };

/** The file part appended on phones. */
export type NativePhotoPart = { uri: string; name: string; type: string; bytes: () => Promise<Uint8Array> };

/** The subset of FormData used here (lets tests record what is appended). */
export type FormLike = { append(name: string, value: unknown, fileName?: string): void };

/** Form field the inventory service reads the image from. */
export const PHOTO_FIELD = "photo";

/** The file could not be read on the phone before upload (a local problem, not the network). */
export const PHOTO_READ_FAILED = "PHOTO_READ_FAILED";

export class PhotoUploadError extends Error {
  readonly status = 0;
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "PhotoUploadError";
  }
}

/** Upload file name (prepareUploadPhoto always re-encodes to JPEG and names it *.jpg). */
const uploadName = (photo: PhotoForUpload) => photo.name || "photo.jpg";

/**
 * Appends the photo to `form`: the Blob on web; on phones a part with the file's bytes read up front (so a read
 * failure is reported as such, not as a network error), plus `uri`, `name` and `type`.
 */
export async function appendPhoto(
  form: FormLike,
  photo: PhotoForUpload,
  options: { isWeb: boolean; readBytes: (uri: string) => Promise<Uint8Array> },
): Promise<void> {
  if (options.isWeb && photo.blob) {
    form.append(PHOTO_FIELD, photo.blob, uploadName(photo));
    return;
  }
  let data: Uint8Array;
  try {
    data = await options.readBytes(photo.uri);
  } catch {
    throw new PhotoUploadError("Không đọc được ảnh. Hãy chụp lại hoặc chọn ảnh khác.", PHOTO_READ_FAILED);
  }
  if (data.byteLength === 0) throw new PhotoUploadError("Không đọc được ảnh. Hãy chụp lại hoặc chọn ảnh khác.", PHOTO_READ_FAILED);
  const part: NativePhotoPart = { uri: photo.uri, name: uploadName(photo), type: photo.mimeType, bytes: () => Promise.resolve(data) };
  form.append(PHOTO_FIELD, part);
}

export const PHOTO_TOO_LARGE_MESSAGE = "Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn 5 MB.";
export const PHOTO_TYPE_MESSAGE = "Định dạng ảnh không hỗ trợ. Hãy dùng ảnh JPEG, PNG hoặc WebP.";
export const PHOTO_SESSION_MESSAGE = "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi thử lại.";
export const PHOTO_UPLOAD_FAILED_MESSAGE = "Tải ảnh thất bại, thử lại.";

/**
 * Message for a failed photo upload. Only a real network failure (status 0, NETWORK_ERROR) keeps the "cannot reach
 * the server" text; HTTP errors get a specific message and never the gateway hint.
 */
export function photoUploadErrorMessage(error: unknown): string {
  const { status, code, message } = (error ?? {}) as { status?: unknown; code?: unknown; message?: unknown };
  if (code === "NETWORK_ERROR" && typeof message === "string") return message;
  if (code === PHOTO_READ_FAILED && typeof message === "string") return message;
  if (status === 413 || code === "PHOTO_TOO_LARGE") return PHOTO_TOO_LARGE_MESSAGE;
  if (status === 415 || code === "UNSUPPORTED_PHOTO_TYPE") return PHOTO_TYPE_MESSAGE;
  if (status === 401) return PHOTO_SESSION_MESSAGE;
  return PHOTO_UPLOAD_FAILED_MESSAGE;
}
