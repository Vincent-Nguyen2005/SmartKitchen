import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({ prisma: {} }));
vi.mock("../middleware/family-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/family-scope")>();
  return { ...actual, requireAnyFamily: vi.fn(async () => "family-1") };
});

import { createApp } from "../app";
import { setPhotoSuggester } from "./photo-suggest.controller";
import { MAX_PHOTO_BYTES } from "../services/photo-storage.service";

const userId = "33333333-3333-4333-8333-333333333333";
const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const unsigned = `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({ sub: userId, exp: Math.floor(Date.now() / 1000) + 600 })}`;
const token = `${unsigned}.${createHmac("sha256", "suggest-test-secret").update(unsigned).digest("base64url")}`;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);

let server: Server;
let baseUrl: string;
const suggester = vi.fn();

const send = (data: Buffer, type = "image/jpeg", auth = true, path = "/api/inventory/photo/suggest") => {
  const form = new FormData();
  form.append("photo", new Blob([new Uint8Array(data)], { type }), "photo.jpg");
  return fetch(`${baseUrl}${path}`, { method: "POST", body: form, headers: auth ? { Authorization: `Bearer ${token}` } : {} });
};

beforeAll(async () => {
  process.env.JWT_SECRET = "suggest-test-secret";
  setPhotoSuggester(suggester);
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
beforeEach(() => {
  suggester.mockReset();
  suggester.mockResolvedValue({ suggestions: [{ name: "Cà rốt", catalogId: "c1", score: 0.8 }], confident: true, source: "clip" });
});

describe("POST /api/inventory/photo/suggest", () => {
  it("returns suggestions for a family member's image (also on the gateway-stripped path); the image is passed in memory only", async () => {
    const response = await send(JPEG);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ suggestions: [{ name: "Cà rốt", catalogId: "c1", score: 0.8 }], confident: true, source: "clip" });
    expect(suggester).toHaveBeenCalledWith(expect.objectContaining({ mimeType: "image/jpeg", userId, familyId: "family-1" }));
    expect(Buffer.from(suggester.mock.calls[0][0].image).equals(JPEG)).toBe(true);
    expect((await send(JPEG, "image/jpeg", true, "/photo/suggest")).status).toBe(200);
  });

  it("401 without a token; 400 for a non-image or a type that does not match the bytes; 413 over 5 MB", async () => {
    expect((await send(JPEG, "image/jpeg", false)).status).toBe(401);
    expect((await send(Buffer.from("not an image"), "image/jpeg")).status).toBe(400);
    expect((await send(JPEG, "image/gif")).status).toBe(400);
    expect((await send(Buffer.concat([JPEG, Buffer.alloc(MAX_PHOTO_BYTES)]))).status).toBe(413);
    expect(suggester).not.toHaveBeenCalled();
  });
});
