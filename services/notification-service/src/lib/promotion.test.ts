import { describe, expect, it } from "vitest";
import { keywordsOverlap, normalizeKeyword } from "./promotion";

describe("promotion helpers", () => {
  it("normalizes Vietnamese keywords", () => expect(normalizeKeyword("  Cà Chua ")).toBe("ca chua"));
  it("matches normalized keyword overlap", () => expect(keywordsOverlap(["Cà chua"], ["ca chua"])).toBe(true));
});
