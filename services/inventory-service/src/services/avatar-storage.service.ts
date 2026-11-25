import { randomBytes } from "node:crypto";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { photoUploadDir, processImage } from "./photo-storage.service";

/**
 * Hồ sơ avatars, stored like Kho item photos: re-encoded by the same image pipeline (EXIF dropped, JPEG, at most
 * AVATAR_EDGE px per side) and written to the uploads volume, one folder per user: <avatars>/<userId>/<random>.jpg.
 * The app saves the returned URL on the user (auth-service PATCH /api/auth/me), which only accepts this user's path.
 */
export const AVATAR_EDGE = 512;
const FILE_NAME = /^[a-f0-9]{32}\.jpg$/;
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Next to the item photos on the same volume (INVENTORY_AVATAR_DIR overrides it). */
export const avatarDir = (): string => path.resolve(process.env.INVENTORY_AVATAR_DIR || path.join(path.dirname(photoUploadDir()), "avatars"));
export const isAvatarFileName = (value: string): boolean => FILE_NAME.test(value);
export const avatarUrlFor = (userId: string, fileName: string): string => `/api/inventory/avatars/${userId.toLowerCase()}/${fileName}`;

const userDir = (userId: string): string => {
  if (!USER_ID.test(userId)) throw new Error("Invalid user id");
  return path.join(avatarDir(), userId.toLowerCase());
};
export const avatarFilePath = (userId: string, fileName: string): string => {
  if (!isAvatarFileName(fileName)) throw new Error("Invalid avatar file name");
  return path.join(userDir(userId), fileName);
};

/** Removes this user's avatar files except `keep` (best effort; a missing folder is fine). */
const removeOthers = async (userId: string, keep: string | null): Promise<void> => {
  const names = await readdir(userDir(userId)).catch(() => [] as string[]);
  await Promise.all(names.filter((name) => isAvatarFileName(name) && name !== keep).map((name) =>
    unlink(path.join(userDir(userId), name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") console.error("[avatar] could not delete file", error.code);
    })));
};

export const AvatarStorage = {
  /** Stores a new avatar and deletes the user's older ones; returns its URL. */
  async save(userId: string, input: Buffer): Promise<string> {
    let output: Buffer;
    try {
      output = await processImage(input, AVATAR_EDGE);
    } catch {
      throw Object.assign(new Error("The image could not be read."), { statusCode: 400, code: "PHOTO_UNREADABLE" });
    }
    const fileName = `${randomBytes(16).toString("hex")}.jpg`;
    await mkdir(userDir(userId), { recursive: true });
    await writeFile(avatarFilePath(userId, fileName), output, { flag: "wx", mode: 0o640 });
    await removeOthers(userId, fileName);
    return avatarUrlFor(userId, fileName);
  },

  async removeAll(userId: string): Promise<void> {
    await removeOthers(userId, null);
  },
};
