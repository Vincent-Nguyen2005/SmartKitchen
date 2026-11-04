import { describe, expect, it } from "vitest";
import { canTransition, isFinalStatus } from "./report-transitions";

describe("report status transitions", () => {
  it("allows only OPEN->IN_REVIEW, OPEN->REJECTED, IN_REVIEW->RESOLVED and IN_REVIEW->REJECTED", () => {
    const all = ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"] as const;
    const targets = ["IN_REVIEW", "RESOLVED", "REJECTED"] as const;
    const allowed = all.flatMap((from) => targets.filter((to) => canTransition(from, to)).map((to) => `${from}->${to}`));
    expect(allowed).toEqual(["OPEN->IN_REVIEW", "OPEN->REJECTED", "IN_REVIEW->RESOLVED", "IN_REVIEW->REJECTED"]);
  });

  it("treats RESOLVED and REJECTED as final", () => {
    expect(isFinalStatus("RESOLVED")).toBe(true);
    expect(isFinalStatus("REJECTED")).toBe(true);
    expect(isFinalStatus("IN_REVIEW")).toBe(false);
  });
});
