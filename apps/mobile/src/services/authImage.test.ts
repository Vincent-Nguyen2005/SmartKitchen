/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { cacheNameFor, imageTarget } from "./authImage";

const base = "https://demo.ngrok-free.dev";
const ngrok = { "ngrok-skip-browser-warning": "1" };
const avatar = "/api/inventory/avatars/0b5c2d4e-1111-4222-8333-444455556666/0123456789abcdef0123456789abcdef.jpg";

test("relative gateway paths become absolute URLs on the API base", () => {
  const target = imageTarget(avatar, { baseUrl: base, accessToken: "tok" });
  assert.equal(target?.kind, "gateway");
  assert.equal(target?.uri, `${base}${avatar}`);
  // Trailing slashes on the base and a missing leading slash on the path are tolerated.
  assert.equal(imageTarget(avatar.slice(1), { baseUrl: `${base}//`, accessToken: "tok" })?.uri, `${base}${avatar}`);
});

test("gateway images carry the Bearer token and the ngrok header; the token always wins", () => {
  const target = imageTarget(avatar, { baseUrl: base, accessToken: "tok", extraHeaders: { ...ngrok, Authorization: "spoofed" } });
  assert.ok(target && target.kind === "gateway");
  assert.deepEqual(target.headers, { Accept: "image/*", "ngrok-skip-browser-warning": "1", Authorization: "Bearer tok" });
});

test("an absolute URL on our own gateway is treated like a relative path (needs the token)", () => {
  const target = imageTarget(`${base}${avatar}`, { baseUrl: base, accessToken: "tok", extraHeaders: ngrok });
  assert.ok(target && target.kind === "gateway");
  assert.equal(target.headers.Authorization, "Bearer tok");
  assert.equal(target.cacheName, cacheNameFor(avatar));
});

test("images on other sites are shown directly, without our headers", () => {
  const external = "https://images.openfoodfacts.org/x/front.jpg";
  assert.deepEqual(imageTarget(external, { baseUrl: base, accessToken: "tok", extraHeaders: ngrok }), { kind: "external", uri: external });
  // A look-alike host is not our gateway.
  assert.equal(imageTarget(`${base}.evil.example/a.jpg`, { baseUrl: base, accessToken: "tok" })?.kind, "external");
});

test("nothing to show: no URL, blank URL, or a gateway image without a session", () => {
  for (const url of [null, undefined, "", "   "]) assert.equal(imageTarget(url, { baseUrl: base, accessToken: "tok" }), null);
  assert.equal(imageTarget(avatar, { baseUrl: base, accessToken: null }), null);
});

test("cache names: file-safe, keep the extension, and a new upload (new file name) is a new cache entry", () => {
  const name = cacheNameFor(avatar);
  assert.match(name, /^[A-Za-z0-9._-]+$/);
  assert.ok(name.endsWith(".jpg"));
  const next = avatar.replace("0123456789abcdef0123456789abcdef", "fedcba9876543210fedcba9876543210");
  assert.notEqual(cacheNameFor(next), name);
  // Kho item photos of different items never share an entry, even with the same file name.
  assert.notEqual(cacheNameFor("/api/inventory/items/a/photo/f.jpg"), cacheNameFor("/api/inventory/items/b/photo/f.jpg"));
  // A version query string also changes the entry.
  assert.notEqual(cacheNameFor(`${avatar}?v=2`), cacheNameFor(`${avatar}?v=3`));
  assert.ok(cacheNameFor(`/x/${"a".repeat(400)}.png`).length <= 180);
});
