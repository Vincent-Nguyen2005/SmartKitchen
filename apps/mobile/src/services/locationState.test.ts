/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { locationStatus, ONE_SHOT_OPTIONS, shouldRequestPermission } from "./locationState";

test("device location off: no permission request and no position, our banner instead", () => {
  assert.equal(locationStatus({ servicesEnabled: false, permissionGranted: null }), "services-off");
  assert.equal(locationStatus({ servicesEnabled: false, permissionGranted: true }), "services-off");
  assert.equal(shouldRequestPermission(false), false);
});

test("permission denied vs granted when location is on", () => {
  assert.equal(shouldRequestPermission(true), true);
  assert.equal(locationStatus({ servicesEnabled: true, permissionGranted: false }), "denied");
  assert.equal(locationStatus({ servicesEnabled: true, permissionGranted: true }), "granted");
});

test("one-shot positions: Balanced accuracy, never the Android settings dialog", () => {
  assert.deepEqual(ONE_SHOT_OPTIONS, { accuracy: "balanced", mayShowUserSettingsDialog: false });
});
