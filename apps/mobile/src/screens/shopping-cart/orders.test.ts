/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { addressFromNominatim, addressText, canCancel, deliveryProblem, isValidVnPhone, mapPickerHtml, nominatimUrl, ORDER_STATUS, orderTime, parsePinMessage, pinFromFrameEvent } from "./orders";

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

test("picker page posts to the WebView on phones and to the parent window in an iframe on web", () => {
  const html = mapPickerHtml({ latitude: 10.7769, longitude: 106.7009 });
  assert.match(html, /window\.ReactNativeWebView\.postMessage\(text\)/);
  assert.match(html, /window\.parent\.postMessage\(text, '\*'\)/);
  assert.match(html, /window\.addEventListener\('message'/); // the app can move the pin ("Dùng vị trí hiện tại")
});

test("web picker messages: only from our iframe and only coordinate pairs", () => {
  const frame = {};
  assert.deepEqual(pinFromFrameEvent({ source: frame, data: '{"latitude":10.5,"longitude":106.2}' }, frame), { latitude: 10.5, longitude: 106.2 });
  assert.equal(pinFromFrameEvent({ source: {}, data: '{"latitude":10.5,"longitude":106.2}' }, frame), null); // another frame
  assert.equal(pinFromFrameEvent({ source: frame, data: { latitude: 10.5 } }, frame), null); // not text
  assert.equal(pinFromFrameEvent({ source: frame, data: "hello" }, frame), null);
  assert.equal(pinFromFrameEvent({ source: frame, data: '{"latitude":1,"longitude":2}' }, null), null); // no iframe yet
});

test("web reverse geocoding (Nominatim): URL and Vietnamese address text", () => {
  assert.equal(nominatimUrl({ latitude: 10.7769, longitude: 106.7009 }), "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=10.776900&lon=106.700900&accept-language=vi&zoom=18&addressdetails=1");
  assert.equal(addressFromNominatim({ address: { house_number: "12", road: "Lê Lợi", quarter: "Bến Nghé", city_district: "Quận 1", city: "Hồ Chí Minh" } }), "12 Lê Lợi, Bến Nghé, Quận 1, Hồ Chí Minh");
  assert.equal(addressFromNominatim({ address: { amenity: "Chợ Bến Thành", suburb: "Bến Thành", city: "Hồ Chí Minh" } }), "Chợ Bến Thành, Bến Thành, Hồ Chí Minh");
  assert.equal(addressFromNominatim({ display_name: "Đường X, Huyện Y, Việt Nam" }), "Đường X, Huyện Y");
  assert.equal(addressFromNominatim(null), "");
});
