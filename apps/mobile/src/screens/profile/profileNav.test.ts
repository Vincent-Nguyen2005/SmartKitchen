/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { closeProfileSub, openProfileSub, PROFILE_CLOSED, profileBack } from "./profileNav";

test("Hồ sơ: a sub-screen opens over the sheet; ✕ / back returns to the sheet, not to the app", () => {
  const sheet = { sheetOpen: true, sub: null };
  const health = openProfileSub(sheet, "health");
  assert.deepEqual(health, { sheetOpen: true, sub: "health" });
  // ✕ / "Quay lại" on the sub-screen: the sheet is still open (same state underneath).
  assert.deepEqual(closeProfileSub(health), { sheetOpen: true, sub: null });
  // Android back: first the sub-screen, then the sheet.
  assert.deepEqual(profileBack(health), { sheetOpen: true, sub: null });
  assert.deepEqual(profileBack(profileBack(health)), PROFILE_CLOSED);
});
