import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_EDGE = 1024;
export type PhotoMimeType = "image/jpeg" | "image/png" | "image/webp";
export const ALLOWED_PHOTO_TYPES: readonly PhotoMimeType[] = ["image/jpeg", "image/png", "image/webp"];

/** Re-encodes an uploaded image to a metadata-free JPEG no larger than MAX_PHOTO_EDGE on either side. */
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
  // rotate() applies the EXIF orientation; sharp drops EXIF/GPS and other metadata unless asked to keep it.
  return sharp(input, { failOn: "error", limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: MAX_PHOTO_EDGE, height: MAX_PHOTO_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
};

let processor: ImageProcessor = sharpProcessor;
export const setImageProcessor = (next: ImageProcessor | null): void => {
  processor = next ?? sharpProcessor;
};

export const photoUploadDir = (): string =>
  path.resolve(process.env.INVENTORY_UPLOAD_DIR || path.join(process.cwd(), "uploads", "inventory"));

const FILE_NAME = /^[a-f0-9]{32}\.jpg$/;
const MANAGED_URL = /^\/api\/inventory\/items\/([0-9a-f-]{36})\/photo\/([a-f0-9]{32}\.jpg)$/;

export const isPhotoFileName = (value: string): boolean => FILE_NAME.test(value);
export const photoUrlFor = (itemId: string, fileName: string): string => `/api/inventory/items/${itemId}/photo/${fileName}`;

/** File name of a photo stored by this service, or null for external image URLs (e.g. Open Food Facts). */
export const managedPhotoFileName = (imageUrl: string | null | undefined): string | null =>
  imageUrl?.match(MANAGED_URL)?.[2] ?? null;

export const photoFilePath = (fileName: string): string => {
  if (!isPhotoFileName(fileName)) throw new Error("Invalid photo file name");
  return path.join(photoUploadDir(), fileName);
};

/** Detects the real image type from magic bytes; the client-declared type is not trusted. */
export const sniffImageType = (data: Buffer): PhotoMimeType | null => {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
};

export const PhotoStorage = {
  async save(itemId: string, input: Buffer): Promise<{ fileName: string; url: string }> {
    let output: Buffer;
    try {
      output = await processor(input);
    } catch {
      throw Object.assign(new Error("The image could not be read."), { statusCode: 400, code: "PHOTO_UNREADABLE" });
    }
    const fileName = `${randomBytes(16).toString("hex")}.jpg`;
    await mkdir(photoUploadDir(), { recursive: true });
    await writeFile(photoFilePath(fileName), output, { flag: "wx", mode: 0o640 });
    return { fileName, url: photoUrlFor(itemId, fileName) };
  },

  /** Best-effort removal; a missing file is not an error. Ignores external URLs. */
  async removeByUrl(imageUrl: string | null | undefined): Promise<void> {
    const fileName = managedPhotoFileName(imageUrl);
    if (!fileName) return;
    await unlink(photoFilePath(fileName)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") console.error("[photo] could not delete file", error.code);
    });
  },
};
