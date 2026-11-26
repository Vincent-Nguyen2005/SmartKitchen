import { describe, expect, it } from "vitest";
import { keywordsOverlap, normalizedKeywords, normalizeKeyword } from "./promotion";

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
