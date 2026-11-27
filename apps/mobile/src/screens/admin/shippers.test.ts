/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { deliveredText, newShipperProblem, passwordProblem } from "./shippers";

test("new shipper form: name, Vietnamese phone, email and a strong password", () => {
  const ok = { name: "Nguyễn Văn An", phone: "090 123 4567", email: "an@example.com", password: "Giaohang1" };
  assert.equal(newShipperProblem(ok), null);
  assert.equal(newShipperProblem({ ...ok, name: " " }), "Nhập tên");
  assert.equal(newShipperProblem({ ...ok, phone: "12345" }), "Số điện thoại không hợp lệ");
  assert.equal(newShipperProblem({ ...ok, email: "an@" }), "Email không hợp lệ");
  assert.equal(passwordProblem("Short1"), "Mật khẩu tối thiểu 8 ký tự");
  assert.equal(passwordProblem("alllower1"), "Mật khẩu cần có chữ hoa, chữ thường và số");
  assert.equal(passwordProblem("Giaohang1"), null);
});

test("delivered count text", () => {
  assert.equal(deliveredText(12), "12 đơn đã giao");
  assert.equal(deliveredText(null), "—");
});
