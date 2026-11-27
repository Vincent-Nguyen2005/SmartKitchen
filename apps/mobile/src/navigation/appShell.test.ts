/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { appShellFor, showsOnboarding } from "./appShell";

test("the shell follows the account's role", () => {
  assert.equal(appShellFor("ADMIN"), "admin");
  assert.equal(appShellFor("SHIPPER"), "shipper");
  assert.equal(appShellFor("USER"), "user");
  assert.equal(appShellFor(undefined), "user");
});

test("only normal users get the onboarding wizard after signing in", () => {
  assert.equal(showsOnboarding("user", true), true);
  assert.equal(showsOnboarding("user", false), false);
  assert.equal(showsOnboarding("shipper", true), false);
  assert.equal(showsOnboarding("admin", true), false);
});
