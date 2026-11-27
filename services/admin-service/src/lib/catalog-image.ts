import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Catalog ingredient images uploaded by an admin (Quản trị › "Chụp ảnh"). Same pipeline as Kho photos: the declared
 * type must match the magic bytes, the image is re-encoded with sharp (EXIF / GPS dropped, orientation applied) to a
 * JPEG of at most CATALOG_IMAGE_EDGE px per side, stored under a random 128-bit name on the admin uploads volume and
 * served to every signed-in user through the gateway (GET /api/admin/catalog/images/<name>.jpg), so the app's
 * AuthImage shows it like an avatar or a Kho photo.
 */
export const MAX_CATALOG_IMAGE_BYTES = 5 * 1024 * 1024;
export const CATALOG_IMAGE_EDGE = 1024;
export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";
export const ALLOWED_IMAGE_TYPES: readonly ImageMimeType[] = ["image/jpeg", "image/png", "image/webp"];
/** Credit stored with an uploaded image (admin-only: the app shows credits only in the admin form). */
export const ADMIN_UPLOAD_CREDIT = "Ảnh do quản trị viên tải lên";

export type ImageProcessor = (input: Buffer) => Promise<Buffer>;
type SharpPipeline = {
  rotate(): SharpPipeline;
  resize(options: { width: number; height: number; fit: "inside"; withoutEnlargement: boolean }): SharpPipeline;
  jpeg(options: { quality: number; mozjpeg?: boolean }): SharpPipeline;
  toBuffer(): Promise<Buffer>;
};
type SharpFactory = (input: Buffer, options: { failOn: "error"; limitInputPixels: number }) => SharpPipeline;

// sharp is loaded on first use so type checks and unit tests do not need its native binary.
const sharpProcessor: ImageProcessor = async (input) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require("sharp") as SharpFactory;
  return sharp(input, { failOn: "error", limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: CATALOG_IMAGE_EDGE, height: CATALOG_IMAGE_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
};
let processor: ImageProcessor = sharpProcessor;
/** Tests replace the processor (no native sharp needed). */
export const setImageProcessor = (next: ImageProcessor | null): void => { processor = next ?? sharpProcessor; };

export const catalogImageDir = (): string => path.resolve(process.env.ADMIN_UPLOAD_DIR || path.join(process.cwd(), "uploads", "admin"));
const FILE_NAME = /^[a-f0-9]{32}\.jpg$/;
const URL_PREFIX = "/api/admin/catalog/images/";
const MANAGED_URL = /^\/api\/admin\/catalog\/images\/([a-f0-9]{32}\.jpg)$/;

export const isCatalogImageFileName = (value: string): boolean => FILE_NAME.test(value);
export const catalogImageUrl = (fileName: string): string => `${URL_PREFIX}${fileName}`;
/** The file name of an image stored here, or null for pasted https links. */
export const managedCatalogImage = (imageUrl: string | null | undefined): string | null => imageUrl?.match(MANAGED_URL)?.[1] ?? null;
export const catalogImagePath = (fileName: string): string => {
  if (!isCatalogImageFileName(fileName)) throw new Error("Invalid image file name");
  return path.join(catalogImageDir(), fileName);
};

/** The real image type from the magic bytes (the declared type is not trusted). */
export const sniffImageType = (data: Buffer): ImageMimeType | null => {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
};

export class CatalogImageError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) { super(message); }
}

/** One uploaded file → validated (type, magic bytes, size) or a CatalogImageError (400 / 413). */
export function validateUpload(file: { mimeType: string; data: Buffer } | undefined): Buffer {
  if (!file || file.data.length === 0) throw new CatalogImageError(400, "INVALID_UPLOAD", "Send exactly one non-empty image file.");
  if (file.data.length > MAX_CATALOG_IMAGE_BYTES) throw new CatalogImageError(413, "PHOTO_TOO_LARGE", "The image must be 5 MB or smaller.");
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimeType as ImageMimeType) || !sniffImageType(file.data)) {
    throw new CatalogImageError(400, "UNSUPPORTED_PHOTO_TYPE", "Only JPEG, PNG or WebP images are accepted.");
  }
  return file.data;
}

export const CatalogImageStorage = {
  async save(input: Buffer): Promise<{ fileName: string; url: string }> {
    let output: Buffer;
    try {
      output = await processor(input);
    } catch {
      throw new CatalogImageError(400, "PHOTO_UNREADABLE", "The image could not be read.");
    }
    const fileName = `${randomBytes(16).toString("hex")}.jpg`;
    await mkdir(catalogImageDir(), { recursive: true });
    await writeFile(catalogImagePath(fileName), output, { flag: "wx", mode: 0o640 });
    return { fileName, url: catalogImageUrl(fileName) };
  },
  /** Best effort: a replaced or failed image file is removed (pasted links are never touched). */
  async removeByUrl(imageUrl: string | null | undefined): Promise<void> {
    const fileName = managedCatalogImage(imageUrl);
    if (fileName) await unlink(catalogImagePath(fileName)).catch(() => undefined);
  },
};
