/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import {
  appendPhoto,
  PHOTO_FIELD,
  PHOTO_READ_FAILED,
  PHOTO_SESSION_MESSAGE,
  PHOTO_TOO_LARGE_MESSAGE,
  PHOTO_TYPE_MESSAGE,
  PHOTO_UPLOAD_FAILED_MESSAGE,
  photoUploadErrorMessage,
  PhotoUploadError,
  type NativePhotoPart,
} from "./photoUpload";

const NETWORK_TEXT = "Không kết nối được máy chủ. Kiểm tra mạng và địa chỉ gateway rồi thử lại.";

const recorder = () => {
  const calls: Array<{ name: string; value: unknown; fileName?: string }> = [];
  return { calls, form: { append: (name: string, value: unknown, fileName?: string) => { calls.push({ name, value, fileName }); } } };
};

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

test("phones: one `photo` part with uri, name, type and the file's bytes (expo/fetch reads `bytes`)", async () => {
  const { calls, form } = recorder();
  const read: string[] = [];
  const photo = { uri: "file:///data/user/0/host.exp.exponent/cache/ImageManipulator/a.jpg", mimeType: "image/jpeg", name: "avatar.jpg" };
  await appendPhoto(form, photo, { isWeb: false, readBytes: async (uri) => { read.push(uri); return jpeg; } });

  assert.deepEqual(read, [photo.uri]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, PHOTO_FIELD);
  assert.equal(calls[0].fileName, undefined);
  const part = calls[0].value as NativePhotoPart;
  assert.equal(part.uri, photo.uri);
  assert.equal(part.name, "avatar.jpg");
  assert.equal(part.type, "image/jpeg");
  assert.deepEqual(await part.bytes(), jpeg);
});

test("phones: content:// URIs are read the same way; a missing name falls back to photo.jpg", async () => {
  const { calls, form } = recorder();
  await appendPhoto(form, { uri: "content://media/external/images/1", mimeType: "image/jpeg", name: "" }, { isWeb: false, readBytes: async () => jpeg });
  assert.equal((calls[0].value as NativePhotoPart).name, "photo.jpg");
});

test("web: the Blob is appended with its file name and the file is not read", async () => {
  const { calls, form } = recorder();
  const blob = new Blob([jpeg], { type: "image/jpeg" });
  await appendPhoto(form, { uri: "blob:x", mimeType: "image/jpeg", name: "photo.jpg", blob }, {
    isWeb: true,
    readBytes: async () => { throw new Error("must not read"); },
  });
  assert.deepEqual(calls, [{ name: PHOTO_FIELD, value: blob, fileName: "photo.jpg" }]);
});

test("a file that cannot be read (or is empty) is a local error, not a network error", async () => {
  for (const readBytes of [async () => { throw new Error("ENOENT"); }, async () => new Uint8Array()]) {
    const { calls, form } = recorder();
    await assert.rejects(
      appendPhoto(form, { uri: "file:///gone.jpg", mimeType: "image/jpeg", name: "photo.jpg" }, { isWeb: false, readBytes }),
      (error: unknown) => error instanceof PhotoUploadError && error.code === PHOTO_READ_FAILED && !error.message.includes("gateway"),
    );
    assert.equal(calls.length, 0);
  }
});

test("error mapping: only a real network failure keeps the gateway text", () => {
  assert.equal(photoUploadErrorMessage({ status: 0, code: "NETWORK_ERROR", message: NETWORK_TEXT }), NETWORK_TEXT);
  assert.equal(photoUploadErrorMessage({ status: 413, code: "PHOTO_TOO_LARGE", message: "The photo must be 5 MB or smaller." }), PHOTO_TOO_LARGE_MESSAGE);
  assert.equal(photoUploadErrorMessage({ status: 413 }), PHOTO_TOO_LARGE_MESSAGE);
  assert.equal(photoUploadErrorMessage({ status: 400, code: "UNSUPPORTED_PHOTO_TYPE", message: "Only JPEG, PNG or WebP images are accepted." }), PHOTO_TYPE_MESSAGE);
  assert.equal(photoUploadErrorMessage({ status: 415 }), PHOTO_TYPE_MESSAGE);
  assert.equal(photoUploadErrorMessage({ status: 401, code: "UNAUTHORIZED" }), PHOTO_SESSION_MESSAGE);
  assert.equal(photoUploadErrorMessage(new PhotoUploadError("Không đọc được ảnh.", PHOTO_READ_FAILED)), "Không đọc được ảnh.");
  for (const other of [{ status: 400, code: "INVALID_UPLOAD", message: "Send exactly one image file." }, { status: 500 }, { status: 502 }, new Error("boom"), undefined, "x"]) {
    const text = photoUploadErrorMessage(other);
    assert.equal(text, PHOTO_UPLOAD_FAILED_MESSAGE);
    assert.ok(!text.includes("gateway"));
  }
});
