import { afterEach, describe, expect, it, vi } from "vitest";
import { requireInternalApiKey } from "./internal-api-key";

afterEach(() => vi.unstubAllEnvs());

function responseMock() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

describe("internal purchase API authentication", () => {
  it("rejects a missing or incorrect key without calling the route", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PURCHASE_SYNC_API_KEY", "test-only-purchase-key");
    const req = { header: vi.fn().mockReturnValue("wrong-key") };
    const res = responseMock();
    const next = vi.fn();

    requireInternalApiKey(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: "INTERNAL_AUTHENTICATION_REQUIRED" });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a matching server-to-server key", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PURCHASE_SYNC_API_KEY", "test-only-purchase-key");
    const req = { header: vi.fn().mockReturnValue("test-only-purchase-key") };
    const res = responseMock();
    const next = vi.fn();

    requireInternalApiKey(req as never, res as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
