/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { deliveredText, filterShippers, newShipperProblem, PASSWORD_RULE, passwordFieldError, passwordProblem, shipperActions, shipperDetailRows, toggleConfirm, vnDate, type ShipperAccount } from "./shippers";

test("new shipper form: name, Vietnamese phone, email and a strong password", () => {
  const ok = { name: "Nguyễn Văn An", phone: "090 123 4567", email: "an@example.com", password: "Giaohang1" };
  assert.equal(newShipperProblem(ok), null);
  assert.equal(newShipperProblem({ ...ok, name: " " }), "Nhập tên");
  assert.equal(newShipperProblem({ ...ok, phone: "12345" }), "Số điện thoại không hợp lệ");
  assert.equal(newShipperProblem({ ...ok, email: "an@" }), "Email không hợp lệ");
  assert.equal(passwordProblem("Short1"), PASSWORD_RULE);
  assert.equal(passwordProblem("alllower1"), PASSWORD_RULE);
  assert.equal(passwordProblem("Giaohang1"), null);
  assert.equal(newShipperProblem({ ...ok, password: "weak" }), PASSWORD_RULE);
});

test("password field: the rule shows only as an inline error when the value is invalid", () => {
  assert.equal(PASSWORD_RULE, "Tối thiểu 8 ký tự, có chữ hoa, chữ thường và số");
  // After typing stops: empty is not an error yet; an invalid value is; a valid one clears it.
  assert.equal(passwordFieldError("", false), null);
  assert.equal(passwordFieldError("abc", false), PASSWORD_RULE);
  assert.equal(passwordFieldError("Giaohang1", false), null);
  // On submit an empty field is an error too.
  assert.equal(passwordFieldError("", true), PASSWORD_RULE);
  assert.equal(passwordFieldError("Giaohang1", true), null);
});

test("search: name accent-insensitive, phone by digits; nothing found → empty list", () => {
  const list = [{ name: "Nguyễn Văn An", phone: "0901234567" }, { name: "Trần Thị Bình", phone: "0987 654 321" }, { name: null, phone: null }];
  assert.equal(filterShippers(list, "").length, 3);
  assert.deepEqual(filterShippers(list, "nguyen an").map((item) => item.name), []);
  assert.deepEqual(filterShippers(list, "van an").map((item) => item.name), ["Nguyễn Văn An"]);
  assert.deepEqual(filterShippers(list, "BINH").map((item) => item.name), ["Trần Thị Bình"]);
  assert.deepEqual(filterShippers(list, "987 654").map((item) => item.name), ["Trần Thị Bình"]);
  assert.deepEqual(filterShippers(list, "0901").map((item) => item.name), ["Nguyễn Văn An"]);
  assert.deepEqual(filterShippers(list, "xyz"), []);
});

test("delivered count text", () => {
  assert.equal(deliveredText(12), "12 đơn đã giao");
  assert.equal(deliveredText(null), "—");
});

const account: ShipperAccount = { id: "s1", name: "Nguyễn Văn An", phone: "0901234567", email: "an@example.com", active: true, createdAt: "2026-11-11T18:30:00.000Z", deliveredCount: 12 };

test("detail sheet: name, phone, email, status, delivered count and created date (Vietnam day)", () => {
  assert.deepEqual(shipperDetailRows(account).map((row) => row.label), ["Họ tên", "Số điện thoại", "Email", "Trạng thái", "Đã giao", "Ngày tạo"]);
  assert.deepEqual(shipperDetailRows(account).map((row) => row.value).slice(3), ["Đang hoạt động", "12 đơn đã giao", "12/11/2026"]);
  assert.equal(shipperDetailRows({ ...account, active: false, name: null, phone: null }).find((row) => row.label === "Trạng thái")?.value, "Đã khóa");
  assert.equal(vnDate("nope"), "—");
});

test("detail sheet actions: Đặt lại mật khẩu, then Khóa (active, destructive) or Mở khóa (locked); same confirms", () => {
  assert.deepEqual(shipperActions(account).map((action) => [action.key, action.label, action.destructive]), [["reset", "Đặt lại mật khẩu", false], ["toggle", "Khóa", true]]);
  assert.deepEqual(shipperActions({ active: false }).map((action) => action.label), ["Đặt lại mật khẩu", "Mở khóa"]);
  assert.deepEqual(toggleConfirm(account), { title: "Khóa tài khoản Nguyễn Văn An?", message: "Người này sẽ không đăng nhập được nữa. Đơn họ đang giao sẽ quay lại danh sách chờ cho người khác nhận.", confirmLabel: "Khóa", destructive: true });
  assert.equal(toggleConfirm({ ...account, active: false }).confirmLabel, "Mở khóa");
});
