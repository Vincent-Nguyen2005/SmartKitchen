import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({ prisma: {} }));

import { createApp } from "../app";
import { MAX_PHOTO_BYTES, setImageProcessor } from "../services/photo-storage.service";

const userId = "33333333-3333-4333-8333-333333333333";
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const PROCESSED = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xdb]), Buffer.from("avatar")]);
const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const unsigned = `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({ sub: userId, exp: Math.floor(Date.now() / 1000) + 600 })}`;
const token = `${unsigned}.${createHmac("sha256", "avatar-test-secret").update(unsigned).digest("base64url")}`;

let server: Server;
let baseUrl: string;
let avatarDir: string;
const edges: Array<number | undefined> = [];
const form = (data: Buffer, type = "image/jpeg") => { const body = new FormData(); body.append("photo", new Blob([new Uint8Array(data)], { type }), "a.jpg"); return body; };
const upload = (body: FormData, auth = true) => fetch(`${baseUrl}/avatars`, { method: "POST", body, headers: auth ? { Authorization: `Bearer ${token}` } : {} });

beforeAll(async () => {
  process.env.JWT_SECRET = "avatar-test-secret";
  avatarDir = await mkdtemp(path.join(os.tmpdir(), "inventory-avatars-"));
  process.env.INVENTORY_AVATAR_DIR = avatarDir;
  setImageProcessor(async (_input, maxEdge) => { edges.push(maxEdge); return PROCESSED; });
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  setImageProcessor(null);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(avatarDir, { recursive: true, force: true });
});

describe("Hồ sơ avatars (same storage and rules as Kho photos)", () => {
  it("stores one re-encoded JPEG (512 px) under the user's own path, replacing the previous one", async () => {
    const first = await upload(form(JPEG));
    expect(first.status).toBe(201);
    const firstUrl = (await first.json()).data.avatarUrl as string;
    expect(firstUrl).toMatch(new RegExp(`^/api/inventory/avatars/${userId}/[a-f0-9]{32}\\.jpg$`));
    expect(edges.at(-1)).toBe(512);
    const second = (await (await upload(form(JPEG))).json()).data.avatarUrl as string;
    expect(await readdir(path.join(avatarDir, userId))).toEqual([second.split("/").pop()]);
    const served = await fetch(`${baseUrl}${second.replace("/api/inventory", "")}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(served.status).toBe(200);
    expect(Buffer.from(await served.arrayBuffer())).toEqual(PROCESSED);
    expect((await fetch(`${baseUrl}${firstUrl.replace("/api/inventory", "")}`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(404);
  });

  it("validates the upload: sign-in, image type from magic bytes, size", async () => {
    expect((await upload(form(JPEG), false)).status).toBe(401);
    const fake = await upload(form(Buffer.from("not an image"), "image/jpeg"));
    expect(fake.status).toBe(400);
    expect((await fake.json()).error).toBe("UNSUPPORTED_PHOTO_TYPE");
    expect((await upload(form(JPEG, "application/pdf"))).status).toBe(400);
    expect((await upload(form(Buffer.concat([JPEG, Buffer.alloc(MAX_PHOTO_BYTES)])))).status).toBe(413);
  });

  it("removes the user's avatar files; bad paths are 404", async () => {
    await upload(form(JPEG));
    const removed = await fetch(`${baseUrl}/avatars`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    expect(removed.status).toBe(200);
    expect(await readdir(path.join(avatarDir, userId))).toEqual([]);
    expect((await fetch(`${baseUrl}/avatars/${userId}/..%2F..%2Fsecret.jpg`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(404);
    expect((await fetch(`${baseUrl}/avatars/not-a-user/${"a".repeat(32)}.jpg`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(404);
    expect(existsSync(path.join(avatarDir, userId))).toBe(true);
  });
});
