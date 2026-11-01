import { describe, expect, it } from "vitest";
import { defaultWeights, knownWeightKeys } from "./weights";

describe("recommendation weights", () => {
  it("defines only known keys and defaults in range", () => {
    expect(knownWeightKeys).toEqual(["expiry_priority", "nutrition_fit", "preference_match"]);
    expect(Object.values(defaultWeights).every((value) => value >= 0 && value <= 1)).toBe(true);
  });
});
