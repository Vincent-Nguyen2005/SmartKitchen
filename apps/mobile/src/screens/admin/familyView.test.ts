/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { familyDate, familyFacts, familyView } from "./familyView";

test("admin family view: only name, member count and created date; no member data", () => {
  const response = { id: "f1", name: "Nhà An", memberCount: 3, createdAt: "2026-11-11T18:30:00.000Z", ownerEmail: "owner@example.com", members: [{ name: "An", email: "an@example.com" }] };
  const view = familyView(response);
  assert.deepEqual(Object.keys(view).sort(), ["createdAt", "id", "memberCount", "name"]);
  assert.equal(JSON.stringify(view).includes("@"), false);
  assert.equal(familyFacts(view), "3 thành viên · Tạo ngày 12/11/2026");
  assert.equal(familyDate("nope"), "—");
});
