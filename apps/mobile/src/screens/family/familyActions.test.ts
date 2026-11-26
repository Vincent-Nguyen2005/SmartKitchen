/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { canRemoveMember, familyRoleLabel, isFamilyOwner, leaveConfirm, ownerLeaveNotice, removeConfirm, transferConfirm } from "./familyActions";

test("family roles are owner and member only: a leftover ADMIN is shown and treated as a member", () => {
  assert.equal(familyRoleLabel("OWNER"), "Chủ gia đình");
  assert.equal(familyRoleLabel("MEMBER"), "Thành viên");
  assert.equal(familyRoleLabel("ADMIN"), "Thành viên");
  assert.equal(isFamilyOwner("OWNER"), true);
  assert.equal(isFamilyOwner("ADMIN"), false);
  assert.equal(isFamilyOwner(undefined), false);
});

test("only the owner can ask someone to leave; never the owner, never oneself", () => {
  const member = { role: "MEMBER" as const, userId: "u2" };
  assert.equal(canRemoveMember(member, "OWNER", "u1"), true);
  assert.equal(canRemoveMember({ role: "ADMIN", userId: "u3" }, "OWNER", "u1"), true);
  assert.equal(canRemoveMember(member, "ADMIN", "u1"), false); // a leftover admin has no management rights
  assert.equal(canRemoveMember(member, "MEMBER", "u1"), false);
  assert.equal(canRemoveMember({ role: "OWNER", userId: "u1" }, "OWNER", "u1"), false);
});

test("leave: Rời gia đình <tên>? with Ở lại / Rời gia đình (destructive)", () => {
  assert.deepEqual(leaveConfirm(" Nhà Huy "), {
    title: "Rời gia đình Nhà Huy?",
    message: "Bạn sẽ không còn xem Kho, thực đơn và giỏ hàng của gia đình này.",
    cancelLabel: "Ở lại", confirmLabel: "Rời gia đình", destructive: true,
  });
});

test("remove: Mời <tên> ra khỏi gia đình? with Hủy / Mời ra", () => {
  const request = removeConfirm("Lan");
  assert.equal(request.title, "Mời Lan ra khỏi gia đình?");
  assert.deepEqual([request.cancelLabel, request.confirmLabel, request.destructive], ["Hủy", "Mời ra", true]);
  assert.equal(removeConfirm("  ").title, "Mời thành viên này ra khỏi gia đình?");
});

test("transfer: Chuyển quyền chủ gia đình cho <tên>? Bạn sẽ trở thành thành viên. with Hủy / Chuyển quyền", () => {
  const request = transferConfirm("Minh");
  assert.equal(request.title, "Chuyển quyền chủ gia đình cho Minh?");
  assert.equal(request.message, "Bạn sẽ trở thành thành viên.");
  assert.deepEqual([request.cancelLabel, request.confirmLabel], ["Hủy", "Chuyển quyền"]);
});

test("owner leaving: transfer ownership first (Quản lý thành viên), or a plain notice when alone", () => {
  const withMembers = ownerLeaveNotice(2);
  assert.equal(withMembers.confirmLabel, "Quản lý thành viên");
  assert.match(withMembers.message, /chuyển quyền chủ gia đình/);
  const alone = ownerLeaveNotice(0);
  assert.deepEqual([alone.confirmLabel, alone.cancelLabel], ["Đã hiểu", null]);
});
