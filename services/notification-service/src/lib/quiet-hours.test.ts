import { describe, expect, it } from "vitest";
import { isWithinQuietHours, keywordsOverlap, normalizedKeywords, normalizeKeyword } from "./promotion";

const VN = "Asia/Ho_Chi_Minh"; // UTC+7, no DST

describe("quiet hours", () => {
  it("is never quiet when start or end is missing", () => {
    expect(isWithinQuietHours(new Date("2026-11-04T15:00:00Z"), null, "06:00", VN)).toBe(false);
    expect(isWithinQuietHours(new Date("2026-11-04T15:00:00Z"), "22:00", null, VN)).toBe(false);
  });

  it("evaluates a same-day window in the user's timezone, not UTC", () => {
    // 05:30 UTC = 12:30 in Ho Chi Minh City
    expect(isWithinQuietHours(new Date("2026-11-04T05:30:00Z"), "12:00", "13:00", VN)).toBe(true);
    expect(isWithinQuietHours(new Date("2026-11-04T05:30:00Z"), "12:00", "13:00", "UTC")).toBe(false);
  });

  it("treats the start as inclusive and the end as exclusive", () => {
    expect(isWithinQuietHours(new Date("2026-11-04T05:00:00Z"), "12:00", "13:00", VN)).toBe(true); // 12:00
    expect(isWithinQuietHours(new Date("2026-11-04T06:00:00Z"), "12:00", "13:00", VN)).toBe(false); // 13:00
  });

  it("handles overnight windows on both sides of midnight", () => {
    expect(isWithinQuietHours(new Date("2026-11-04T16:30:00Z"), "22:00", "06:00", VN)).toBe(true); // 23:30
    expect(isWithinQuietHours(new Date("2026-11-04T20:00:00Z"), "22:00", "06:00", VN)).toBe(true); // 03:00 next day
    expect(isWithinQuietHours(new Date("2026-11-04T23:30:00Z"), "22:00", "06:00", VN)).toBe(false); // 06:30
    expect(isWithinQuietHours(new Date("2026-11-04T08:00:00Z"), "22:00", "06:00", VN)).toBe(false); // 15:00
  });

  it("follows DST in timezones that observe it", () => {
    // 21:30 UTC on 2026-07-01 is 23:30 in Berlin (CEST, UTC+2), on 2026-01-15 it is 22:30 (CET, UTC+1)
    expect(isWithinQuietHours(new Date("2026-07-01T21:30:00Z"), "23:00", "07:00", "Europe/Berlin")).toBe(true);
    expect(isWithinQuietHours(new Date("2026-01-15T21:30:00Z"), "23:00", "07:00", "Europe/Berlin")).toBe(false);
  });
});

describe("keyword normalization", () => {
  it("strips Vietnamese diacritics, case and surrounding spaces", () => {
    expect(normalizeKeyword("  RAU CẢI Xanh ")).toBe("rau cai xanh");
  });

  it("deduplicates and drops empty keywords", () => {
    expect(normalizedKeywords(["Cà chua", "ca chua", "  ", "Thịt bò"])).toEqual(["ca chua", "thit bo"]);
  });

  it("matches only on a whole normalized keyword, not substrings", () => {
    expect(keywordsOverlap(["ca chua bi"], ["ca chua"])).toBe(false);
    expect(keywordsOverlap(["Cà chua", "hành"], ["HÀNH"])).toBe(true);
    expect(keywordsOverlap(["ca chua"], [])).toBe(false);
  });
});
