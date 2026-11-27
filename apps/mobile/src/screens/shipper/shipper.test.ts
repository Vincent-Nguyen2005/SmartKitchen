/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { codText, deliverConfirmTitle, directionsUrls, distanceText, failReasonText, lineQuantity, loadRoute, mapViewHtml, osrmUrl, parseOsrm, placedText, routeMapHtml, routeSummary, SHIPPER_TABS, shortAddress, straightRoute, telUrl } from "./shipper";

test("tabs and money texts", () => {
  assert.deepEqual(SHIPPER_TABS.map((tab) => tab.label), ["Đơn chờ", "Đang giao", "Lịch sử"]);
  assert.equal(codText(675000), "Thu 675.000đ");
  assert.equal(deliverConfirmTitle(675000), "Xác nhận đã giao và thu 675.000đ?");
});

test("fail reasons: fixed ones as they are, Khác needs text", () => {
  assert.equal(failReasonText("Sai địa chỉ", ""), "Sai địa chỉ");
  assert.equal(failReasonText("Khác", "  "), null);
  assert.equal(failReasonText("Khác", " Cổng khóa "), "Cổng khóa");
  assert.equal(failReasonText(null, "x"), null);
});

test("distance, address, time", () => {
  assert.equal(distanceText(0.84), "840 m");
  assert.equal(distanceText(2.44), "2,4 km");
  assert.equal(distanceText(null), null);
  assert.equal(shortAddress("12 Lê Lợi, Bến Nghé, Quận 1, Hồ Chí Minh"), "12 Lê Lợi, Bến Nghé");
  assert.equal(shortAddress(null), "Chưa có địa chỉ");
  const now = new Date("2026-11-27T05:00:00Z"); // 12:00 in Vietnam
  assert.equal(placedText("2026-11-27T03:05:00Z", now), "10:05");
  assert.equal(placedText("2026-11-26T11:05:00Z", now), "26/11 · 18:05");
  assert.equal(lineQuantity({ quantity: 1.5, unit: "KILOGRAM", unitLabel: null }), "1,5 kg");
});

test("call and directions links", () => {
  assert.equal(telUrl("090 123 4567"), "tel:0901234567");
  const order = { latitude: 10.77, longitude: 106.7, deliveryAddress: "12 Lê Lợi" };
  assert.deepEqual(directionsUrls(order, "android"), ["geo:10.77,106.7?q=10.77,106.7", "https://www.google.com/maps/dir/?api=1&destination=10.77,106.7"]);
  assert.equal(directionsUrls(order, "ios")[0], "maps://?daddr=10.77,106.7");
  assert.deepEqual(directionsUrls({ latitude: null, longitude: null, deliveryAddress: "12 Lê Lợi" }, "android"), ["https://www.google.com/maps/search/?api=1&query=12%20L%C3%AA%20L%E1%BB%A3i"]);
  assert.match(mapViewHtml(10.77, 106.7), /setView\(\[10\.770000, 106\.700000\], 16\)/);
});

test("route: OSRM URL in lng,lat order; parsed route; straight-line fallback on any failure", async () => {
  const shipperAt = { latitude: 10.7626, longitude: 106.6602 };
  const customer = { latitude: 10.7769, longitude: 106.7009 };
  assert.equal(osrmUrl(shipperAt, customer), "https://router.project-osrm.org/route/v1/driving/106.660200,10.762600;106.700900,10.776900?overview=full&geometries=geojson");
  const answer = { code: "Ok", routes: [{ distance: 5234, duration: 720, geometry: { coordinates: [[106.6602, 10.7626], [106.68, 10.77], [106.7009, 10.7769]] } }] };
  const route = parseOsrm(answer);
  assert.deepEqual(route?.coordinates[0], [10.7626, 106.6602]); // [lat, lng] for Leaflet
  assert.equal(routeSummary(route!), "5,2 km · 12 phút");
  assert.equal(parseOsrm({ code: "NoRoute", routes: [] }), null);

  const ok = await loadRoute(shipperAt, customer, (async () => ({ ok: true, json: async () => answer })) as unknown as typeof fetch);
  assert.equal(ok.straight, false);
  for (const failing of [async () => { throw new Error("offline"); }, async () => ({ ok: false, json: async () => ({}) }), async () => ({ ok: true, json: async () => ({ code: "NoRoute" }) })]) {
    const fallback = await loadRoute(shipperAt, customer, failing as unknown as typeof fetch);
    assert.equal(fallback.straight, true);
    assert.equal(fallback.coordinates.length, 2);
    assert.match(routeSummary(fallback), /^Đường thẳng 4,7 km$/);
  }
  const html = routeMapHtml(customer, shipperAt, straightRoute(shipperAt, customer));
  assert.match(html, /L\.polyline\(\[\[10\.762600,106\.660200\],\[10\.776900,106\.700900\]\]/);
  assert.match(html, /dashArray/); // the straight fallback is dashed
  assert.doesNotMatch(routeMapHtml(customer, null, null), /polyline/);
});
