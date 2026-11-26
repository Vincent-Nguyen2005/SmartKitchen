/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { addressText, canCancel, deliveryProblem, isValidVnPhone, mapPickerHtml, ORDER_STATUS, orderTime, parsePinMessage } from "./orders";

test("status chips and cancel rule", () => {
  assert.deepEqual(Object.values(ORDER_STATUS).map((status) => status.label), ["Đã đặt", "Đang giao", "Đã giao", "Đã hủy", "Không giao được"]);
  assert.equal(canCancel("PENDING"), true);
  for (const status of ["SHIPPING", "DELIVERED", "CANCELLED", "FAILED"] as const) assert.equal(canCancel(status), false, status);
});

test("Vietnamese phone numbers (same rule as the server)", () => {
  for (const phone of ["0901234567", "090 123 4567", "+84912345678", "0389.123.456", "0283 822 1234"]) assert.equal(isValidVnPhone(phone), true, phone);
  for (const phone of ["12345", "0123456789", "09012345678", "abc"]) assert.equal(isValidVnPhone(phone), false, phone);
});

test("checkout form: address, receiver and phone are required", () => {
  const ok = { address: "12 Lê Lợi, Quận 1", receiverName: "Lan", receiverPhone: "0901234567" };
  assert.equal(deliveryProblem(ok), null);
  assert.equal(deliveryProblem({ ...ok, address: " " }), "Nhập địa chỉ giao hàng");
  assert.equal(deliveryProblem({ ...ok, receiverName: "" }), "Nhập tên người nhận");
  assert.equal(deliveryProblem({ ...ok, receiverPhone: "123" }), "Số điện thoại không hợp lệ");
});

test("address from reverse geocoding", () => {
  assert.equal(addressText({ formattedAddress: "12 Lê Lợi, Bến Nghé, Quận 1, Hồ Chí Minh, Việt Nam" }), "12 Lê Lợi, Bến Nghé, Quận 1, Hồ Chí Minh");
  assert.equal(addressText({ streetNumber: "12", street: "Lê Lợi", district: "Bến Nghé", subregion: "Quận 1", city: "Hồ Chí Minh", region: "Hồ Chí Minh" }), "12 Lê Lợi, Bến Nghé, Quận 1, Hồ Chí Minh");
  assert.equal(addressText({ name: "Chợ Bến Thành", city: "Hồ Chí Minh" }), "Chợ Bến Thành, Hồ Chí Minh");
  assert.equal(addressText(null), "");
});

test("order time in Vietnam time", () => {
  assert.equal(orderTime("2026-11-26T11:05:00.000Z"), "26/11 · 18:05");
});

test("map page: only numeric coordinates go in; only coordinate pairs come out", () => {
  const html = mapPickerHtml({ latitude: 10.7769, longitude: 106.7009 });
  assert.match(html, /setView\(\[10\.776900, 106\.700900\], 17\)/);
  assert.match(html, /tile\.openstreetmap\.org/);
  assert.deepEqual(parsePinMessage('{"latitude":10.5,"longitude":106.2}'), { latitude: 10.5, longitude: 106.2 });
  assert.equal(parsePinMessage('{"latitude":"x"}'), null);
  assert.equal(parsePinMessage("not json"), null);
  assert.equal(parsePinMessage('{"latitude":100,"longitude":0}'), null);
});
