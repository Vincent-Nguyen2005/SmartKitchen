/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { BADGE_MIN_INTERVAL_MS, isRateLimited, shouldRefreshBadge } from "./liveRefresh";

test("tab badge: tab switches refresh at most every 15 s; real changes refresh at once", () => {
  assert.equal(shouldRefreshBadge(null, 1000), true);
  assert.equal(shouldRefreshBadge(1000, 1000 + BADGE_MIN_INTERVAL_MS - 1), false);
  assert.equal(shouldRefreshBadge(1000, 1000 + BADGE_MIN_INTERVAL_MS), true);
  assert.equal(shouldRefreshBadge(1000, 1001, true), true);
});

test("429 is recognised (small notice + one later reload instead of the red error screen)", () => {
  assert.equal(isRateLimited({ status: 429 }), true);
  assert.equal(isRateLimited({ status: 500 }), false);
  assert.equal(isRateLimited(new Error("x")), false);
});
