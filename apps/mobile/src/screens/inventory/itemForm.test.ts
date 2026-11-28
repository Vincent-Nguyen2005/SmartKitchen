/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { FieldError } from "../../services/autoSave";
import { manualPatch, type ItemFields } from "./itemForm";

const fields = (patch: Partial<ItemFields> = {}): ItemFields => ({ name: "Sữa tươi", quantity: "2", unit: "hộp", expiry: "31/12/2026", ...patch });
const fieldOf = (run: () => unknown): string | null => {
  try { run(); return null; } catch (error) { return error instanceof FieldError ? error.field : "other"; }
};

test("manual item: valid fields become the update; decimal comma; empty expiry clears it", () => {
  assert.deepEqual(manualPatch(fields({ quantity: "1,5" }), "BOX"), { name: "Sữa tươi", quantity: 1.5, unit: "BOX", unitLabel: null, expiryDate: "2026-12-31T00:00:00.000Z" });
  assert.equal(manualPatch(fields({ expiry: "" }), "BOX").expiryDate, null);
});

test("manual item: errors name the field (shown inline, input kept)", () => {
  assert.equal(fieldOf(() => manualPatch(fields({ name: " " }), "BOX")), "name");
  assert.equal(fieldOf(() => manualPatch(fields({ quantity: "-1" }), "BOX")), "quantity");
  assert.equal(fieldOf(() => manualPatch(fields({ quantity: "" }), "BOX")), "quantity");
  assert.equal(fieldOf(() => manualPatch(fields({ expiry: "2026-12-31" }), "BOX")), "expiry");
  assert.equal(fieldOf(() => manualPatch(fields({ expiry: "31/02/2026" }), "BOX")), "expiry");
});

test("the storage place is no longer part of the sheet: the update never sends it", () => {
  assert.equal("storageLocation" in manualPatch(fields(), "BOX"), false);
});
