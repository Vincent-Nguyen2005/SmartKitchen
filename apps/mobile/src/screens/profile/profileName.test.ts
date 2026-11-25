/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { initialsOf, nameProblem } from "./profileName";

test("display name: 1-50 characters after trimming", () => {
  assert.equal(nameProblem("  An  "), null);
  assert.equal(nameProblem("x".repeat(50)), null);
  assert.equal(nameProblem("   "), "Tên không được để trống.");
  assert.equal(nameProblem("x".repeat(51)), "Tên tối đa 50 ký tự.");
});

test("initials for the avatar fallback", () => {
  assert.equal(initialsOf("Nguyễn Văn An"), "NA");
  assert.equal(initialsOf("lan"), "L");
  assert.equal(initialsOf("  "), "?");
  assert.equal(initialsOf(null), "?");
  assert.equal(initialsOf("đức anh"), "ĐA");
});
