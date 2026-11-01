import { describe, expect, it } from "vitest";
import { isWithinQuietHours, keywordsOverlap, normalizeKeyword } from "./promotion";

describe("promotion helpers", () => {
  it("normalizes Vietnamese keywords", () => expect(normalizeKeyword("  Cà Chua ")).toBe("ca chua"));
  it("matches normalized keyword overlap", () => expect(keywordsOverlap(["Cà chua"], ["ca chua"])).toBe(true));
  it("handles quiet hours crossing midnight", () => expect(isWithinQuietHours(new Date("2026-01-01T18:00:00Z"), "23:00", "06:00", "Asia/Ho_Chi_Minh")).toBe(true));
});
