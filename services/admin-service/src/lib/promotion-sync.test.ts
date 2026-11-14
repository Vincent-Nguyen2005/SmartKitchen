import { describe, expect, it, vi } from "vitest";
import { addDays, createPromotionSync, endOfVnDay, externalIdFor, vnToday, type SyncableIngredient } from "./promotion-sync";

const now = new Date("2026-11-14T03:00:00.000Z"); // 10:00 in Vietnam
const ingredient: SyncableIngredient = {
  id: "i1", name: "Cà chua", isActive: true, imageUrl: "https://cdn.example.com/ca-chua.jpg", discountPercent: 20,
  promoEndDate: new Date("2026-11-30T00:00:00.000Z"),
};
const ok = () => vi.fn().mockResolvedValue({ ok: true, status: 200 });
const build = (fetchImpl: ReturnType<typeof vi.fn>, apiKey: string | undefined = "internal-key") =>
  createPromotionSync({ baseUrl: "http://notification-service:4010/", apiKey, fetchImpl, logger: vi.fn(), now: () => now });

describe("date helpers", () => {
  it("uses the Vietnam calendar day and the end of that day", () => {
    expect(vnToday(new Date("2026-11-14T18:30:00.000Z"))).toBe("2026-11-15"); // 01:30 next day in Vietnam
    expect(addDays("2026-11-28", 7)).toBe("2026-12-05");
    expect(endOfVnDay("2026-11-30").toISOString()).toBe("2026-11-30T16:59:59.999Z");
  });
});

describe("promotion sync", () => {
  it("upserts one promotion per ingredient through the internal route with the internal key", async () => {
    const fetchImpl = ok();
    expect(await build(fetchImpl).sync(ingredient, false)).toBe("synced");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`http://notification-service:4010/internal/promotions/${encodeURIComponent(externalIdFor("i1"))}`);
    expect(init.method).toBe("PUT");
    expect(init.headers["x-api-key"]).toBe("internal-key");
    expect(JSON.parse(init.body)).toEqual({
      partnerName: "SmartKitchen", title: "Cà chua giảm 20%", discountInfo: "20%", productKeywords: ["Cà chua"],
      imageUrl: "https://cdn.example.com/ca-chua.jpg", startsAt: now.toISOString(), endsAt: "2026-11-30T16:59:59.999Z",
    });
  });

  it("defaults the end to 7 days from today when no end date is stored", async () => {
    const fetchImpl = ok();
    await build(fetchImpl).sync({ ...ingredient, promoEndDate: null }, false);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).endsAt).toBe("2026-11-21T16:59:59.999Z");
  });

  it("deactivates when the discount is cleared or the ingredient is hidden, if a promotion may exist", async () => {
    for (const changed of [{ ...ingredient, discountPercent: null }, { ...ingredient, isActive: false }]) {
      const fetchImpl = ok();
      expect(await build(fetchImpl).sync(changed, true)).toBe("synced");
      expect(fetchImpl.mock.calls[0][0]).toMatch(/\/internal\/promotions\/admin-ingredient%3Ai1\/deactivate$/);
      expect(fetchImpl.mock.calls[0][1].method).toBe("POST");
    }
  });

  it("does nothing when there is no discount now and none before", async () => {
    const fetchImpl = ok();
    expect(await build(fetchImpl).sync({ ...ingredient, discountPercent: null }, false)).toBe("none");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports failed (never throws) when notification-service is down, answers an error, or the key is missing", async () => {
    expect(await build(vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))).sync(ingredient, false)).toBe("failed");
    expect(await build(vi.fn().mockResolvedValue({ ok: false, status: 500 })).sync(ingredient, false)).toBe("failed");
    const fetchImpl = ok();
    expect(await build(fetchImpl, "").sync(ingredient, false)).toBe("failed"); // empty = not configured
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
