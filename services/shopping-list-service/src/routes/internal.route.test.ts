import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { productUsageHandler, requireInternalKey } from "./internal.route";

const KEY = "k".repeat(40);
afterEach(() => vi.unstubAllEnvs());

function responseMock() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}
const req = (key: string | undefined, productId = "p1") => ({ get: () => key, params: { productId } }) as unknown as Request;

describe("internal product usage", () => {
  it("needs the internal key", () => {
    vi.stubEnv("INTERNAL_API_KEY", KEY);
    const res = responseMock(); const next = vi.fn();
    requireInternalKey(req("wrong"), res as never, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    requireInternalKey(req(KEY), responseMock() as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("counts shopping-list items added from the product", async () => {
    const count = vi.fn().mockResolvedValue(2);
    const res = responseMock();
    await productUsageHandler({ shoppingItem: { count } } as never)(req(KEY, "p1"), res as never, vi.fn());
    expect(count).toHaveBeenCalledWith({ where: { productId: "p1" } });
    expect(res.json).toHaveBeenCalledWith({ items: 2 });
  });
});
