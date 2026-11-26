/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { greetingSlot, mealDishes, mealLine, msUntilNextBoundary, pushTarget, vnNow, type GreetingMenu } from "./greeting";

// A Vietnam wall-clock time (UTC+7) as a Date, whatever the test machine's time zone.
const vn = (time: string, day = "2026-11-26") => new Date(new Date(`${day}T${time}:00Z`).getTime() - 7 * 3_600_000);
const meal = (time: string) => greetingSlot(vn(time))?.meal ?? null;

test("time slots at every boundary (Asia/Ho_Chi_Minh)", () => {
  assert.deepEqual(
    ["06:59", "07:00", "09:59", "10:00", "13:59", "14:00", "16:59", "17:00", "21:59", "22:00"].map(meal),
    [null, "BREAKFAST", "BREAKFAST", "LUNCH", "LUNCH", null, null, "DINNER", "DINNER", null],
  );
  assert.equal(greetingSlot(vn("07:00"))?.text, "Chào buổi sáng, chúc bạn một ngày vui vẻ!");
  assert.equal(greetingSlot(vn("12:00"))?.text, "Chúc bạn buổi trưa an lành!");
  assert.equal(greetingSlot(vn("19:00"))?.text, "Chúc bạn buổi tối dịu êm!");
  assert.deepEqual([greetingSlot(vn("08:00"))?.icon, greetingSlot(vn("11:00"))?.icon, greetingSlot(vn("20:00"))?.icon], ["sun", "cloud-sun", "moon"]);
  // 06:30 in Vietnam is still the previous UTC day: the Vietnam day is used.
  assert.deepEqual(vnNow(vn("06:30")), { day: "2026-11-26", minutes: 390, weekday: 4 });
});

test("the open screen re-checks at the next boundary", () => {
  assert.equal(msUntilNextBoundary(vn("09:59")), 60_000);
  assert.equal(msUntilNextBoundary(vn("14:00")), 3 * 3_600_000);
  assert.equal(msUntilNextBoundary(vn("23:00")), 8 * 3_600_000); // next day 07:00
});

test("meal mapping: today's dishes of that meal, own day menu first, Lịch order", () => {
  const day = "2026-11-26"; // Thursday
  const dayMenu: GreetingMenu = { periodType: "DAY", startDate: `${day}T00:00:00.000Z`, endDate: `${day}T00:00:00.000Z`, items: [
    { dishName: "Sữa đậu nành", mealType: "BREAKFAST", dayOfWeek: 4, details: { role: "do_uong" } },
    { dishName: "Bún riêu cua", mealType: "BREAKFAST", dayOfWeek: 4, details: { role: "mot_mon" } },
    { dishName: "Bánh mì trứng ốp la", mealType: "BREAKFAST", dayOfWeek: 4, details: { role: "sang" } },
    { dishName: "Canh chua cá", mealType: "DINNER", dayOfWeek: 4, details: { role: "canh" } },
  ] };
  const weekMenu: GreetingMenu = { periodType: "WEEK", startDate: "2026-11-23T00:00:00.000Z", endDate: "2026-11-29T00:00:00.000Z", items: [
    { dishName: "Phở bò", mealType: "BREAKFAST", dayOfWeek: 4 },
    { dishName: "Xôi", mealType: "BREAKFAST", dayOfWeek: 5 },
  ] };
  assert.deepEqual(mealDishes([weekMenu, dayMenu], day, 4, "BREAKFAST"), ["Bánh mì trứng ốp la", "Bún riêu cua", "Sữa đậu nành"]);
  assert.deepEqual(mealDishes([dayMenu], day, 4, "DINNER"), ["Canh chua cá"]);
  assert.deepEqual(mealDishes([dayMenu], day, 4, "LUNCH"), []);
  assert.deepEqual(mealDishes([weekMenu], day, 4, "BREAKFAST"), ["Phở bò"]);
  assert.deepEqual(mealDishes([], day, 4, "BREAKFAST"), []);
  assert.equal(mealLine("BREAKFAST", ["Bánh mì trứng ốp la", "Bún riêu cua"]), "Bữa sáng: Bánh mì trứng ốp la, Bún riêu cua");
  assert.equal(mealLine("LUNCH", ["Cơm gà"]), "Bữa trưa: Cơm gà");
  assert.equal(mealLine("DINNER", []), null); // no menu: greeting only
});

test("a tapped morning push opens today's breakfast, or the home without a menu", () => {
  assert.deepEqual(pushTarget({ type: "morning", screen: "menu", meal: "BREAKFAST", day: "2026-11-26" }), { meal: "BREAKFAST" });
  assert.deepEqual(pushTarget({ type: "morning", screen: "home" }), { meal: null });
  assert.equal(pushTarget({ promotionId: "p1" }), undefined);
  assert.equal(pushTarget(null), undefined);
});
