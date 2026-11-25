import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  foodItem: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
}));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

const familyId = "11111111-1111-4111-8111-111111111111";
const otherFamilyId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const itemId = "55555555-5555-4555-8555-555555555555";

vi.mock("../middleware/family-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/family-scope")>();
  return {
    ...actual,
    // The signed-in test user belongs to `familyId` only.
    requireFamilyMembership: vi.fn(async (_req: unknown, requested: string) => {
      if (requested !== familyId) throw new actual.InventoryAccessError(403, "FAMILY_ACCESS_DENIED", "You do not have access to this family.");
    }),
  };
});

import { createApp } from "../app";
import { MAX_PHOTO_BYTES, photoUrlFor, setImageProcessor } from "../services/photo-storage.service";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const PROCESSED = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xdb]), Buffer.from("processed")]);

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const signToken = (): string => {
  const unsigned = `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({ sub: userId, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${unsigned}.${createHmac("sha256", "photo-test-secret").update(unsigned).digest("base64url")}`;
};

let server: Server;
let baseUrl: string;
let uploadDir: string;
const token = signToken();

const imageForm = (data: Buffer, type = "image/jpeg", name = "photo.jpg") => {
  const form = new FormData();
  form.append("photo", new Blob([new Uint8Array(data)], { type }), name);
  return form;
};
const upload = (form: FormData, auth = true) => fetch(`${baseUrl}/items/${itemId}/photo`, {
  method: "POST",
  body: form,
  headers: auth ? { Authorization: `Bearer ${token}` } : {},
});
const storedFiles = (url: string) => path.join(uploadDir, url.split("/").pop() as string);
const item = (overrides: Record<string, unknown> = {}) => ({ id: itemId, familyId, imageUrl: null, ...overrides });

beforeAll(async () => {
  process.env.JWT_SECRET = "photo-test-secret";
  uploadDir = await mkdtemp(path.join(os.tmpdir(), "inventory-photos-"));
  process.env.INVENTORY_UPLOAD_DIR = uploadDir;
  setImageProcessor(async () => PROCESSED);
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  setImageProcessor(null);
  await rm(uploadDir, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.foodItem.findFirst.mockResolvedValue(item());
  prismaMock.foodItem.updateMany.mockResolvedValue({ count: 1 });
});

describe("inventory item photos", () => {
  it("stores a re-encoded JPEG under a random name and saves its URL", async () => {
    const response = await upload(imageForm(JPEG));
    const body = await response.json() as { data: { imageUrl: string } };

    expect(response.status).toBe(201);
    expect(body.data.imageUrl).toMatch(new RegExp(`^/api/inventory/items/${itemId}/photo/[a-f0-9]{32}\\.jpg$`));
    await expect(readFile(storedFiles(body.data.imageUrl))).resolves.toEqual(PROCESSED);
    expect(prismaMock.foodItem.updateMany).toHaveBeenCalledWith({ where: { id: itemId, deletedAt: null }, data: { imageUrl: body.data.imageUrl } });
  });

  it("rejects a photo larger than 5 MB with 413", async () => {
    const tooLarge = Buffer.concat([JPEG, Buffer.alloc(MAX_PHOTO_BYTES)]);
    const response = await upload(imageForm(tooLarge));
    expect(response.status).toBe(413);
    expect(prismaMock.foodItem.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a file that is not JPEG, PNG or WebP with 400", async () => {
    const gif = Buffer.from("GIF89a-not-allowed");
    expect((await upload(imageForm(gif, "image/gif", "a.gif"))).status).toBe(400);
    // A declared image type does not help when the bytes are not an image.
    expect((await upload(imageForm(Buffer.from("<svg/>"), "image/png", "a.png"))).status).toBe(400);
    expect(prismaMock.foodItem.updateMany).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    expect((await upload(imageForm(JPEG), false)).status).toBe(401);
    expect(prismaMock.foodItem.findFirst).not.toHaveBeenCalled();
  });

  it("returns 403 for an item in another family", async () => {
    prismaMock.foodItem.findFirst.mockResolvedValue(item({ familyId: otherFamilyId }));
    expect((await upload(imageForm(JPEG))).status).toBe(403);
    const read = await fetch(`${baseUrl}/items/${itemId}/photo/${"a".repeat(32)}.jpg`, { headers: { Authorization: `Bearer ${token}` } });
    expect(read.status).toBe(403);
    expect(prismaMock.foodItem.updateMany).not.toHaveBeenCalled();
  });

  it("refuses adding, changing or removing the photo of an item bought in Đi chợ (409)", async () => {
    prismaMock.foodItem.findFirst.mockResolvedValue(item({ origin: "PURCHASE" }));
    const added = await upload(imageForm(JPEG));
    expect(added.status).toBe(409);
    expect((await added.json()).error).toBe("PURCHASED_ITEM_LOCKED");
    const removed = await fetch(`${baseUrl}/items/${itemId}/photo`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    expect(removed.status).toBe(409);
    expect(prismaMock.foodItem.updateMany).not.toHaveBeenCalled();
  });

  it("deletes the old file when a photo is replaced", async () => {
    const oldName = `${"b".repeat(32)}.jpg`;
    await writeFile(path.join(uploadDir, oldName), JPEG);
    prismaMock.foodItem.findFirst.mockResolvedValue(item({ imageUrl: photoUrlFor(itemId, oldName) }));

    const response = await upload(imageForm(JPEG));
    expect(response.status).toBe(201);
    expect(existsSync(path.join(uploadDir, oldName))).toBe(false);
  });

  it("serves the current photo only to family members and never other paths", async () => {
    const name = `${"c".repeat(32)}.jpg`;
    await writeFile(path.join(uploadDir, name), PROCESSED);
    prismaMock.foodItem.findFirst.mockResolvedValue(item({ imageUrl: photoUrlFor(itemId, name) }));
    const auth = { Authorization: `Bearer ${token}` };

    const ok = await fetch(`${baseUrl}/items/${itemId}/photo/${name}`, { headers: auth });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("image/jpeg");
    expect(Buffer.from(await ok.arrayBuffer())).toEqual(PROCESSED);

    expect((await fetch(`${baseUrl}/items/${itemId}/photo/${"d".repeat(32)}.jpg`, { headers: auth })).status).toBe(404);
    expect((await fetch(`${baseUrl}/items/${itemId}/photo/..%2F..%2Fetc%2Fpasswd`, { headers: auth })).status).toBe(404);
    expect((await fetch(`${baseUrl}/items/${itemId}/photo/${name}`)).status).toBe(401);
  });

  it("removes the photo with DELETE /:id/photo", async () => {
    const name = `${"e".repeat(32)}.jpg`;
    await writeFile(path.join(uploadDir, name), PROCESSED);
    prismaMock.foodItem.findFirst.mockResolvedValue(item({ imageUrl: photoUrlFor(itemId, name) }));

    const response = await fetch(`${baseUrl}/items/${itemId}/photo`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    expect(prismaMock.foodItem.updateMany).toHaveBeenCalledWith({ where: { id: itemId, deletedAt: null }, data: { imageUrl: null } });
    expect(existsSync(path.join(uploadDir, name))).toBe(false);
  });

  it("deletes the photo file when the item is deleted", async () => {
    const name = `${"f".repeat(32)}.jpg`;
    await writeFile(path.join(uploadDir, name), PROCESSED);
    prismaMock.foodItem.findFirst.mockResolvedValue(item({ imageUrl: photoUrlFor(itemId, name) }));
    prismaMock.foodItem.update.mockResolvedValue(item({ deletedAt: new Date() }));

    const response = await fetch(`${baseUrl}/items/${itemId}?familyId=${familyId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    expect(prismaMock.foodItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ imageUrl: null }) }));
    expect(existsSync(path.join(uploadDir, name))).toBe(false);
  });
});
