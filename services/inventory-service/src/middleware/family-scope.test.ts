import { afterEach, describe, expect, it, vi } from "vitest";
import { requireFamilyMembership } from "./family-scope";
import type { InventoryAuthRequest } from "./auth.middleware";

const familyId = "11111111-1111-4111-8111-111111111111";
const otherFamilyId = "22222222-2222-4222-8222-222222222222";
const request = { authUser: { userId: "33333333-3333-4333-8333-333333333333", token: "verified-token" } } as InventoryAuthRequest;

afterEach(() => vi.unstubAllGlobals());

describe("inventory family scope", () => {
  it("forwards the verified bearer token and accepts the matching family", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { family: { id: familyId } } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(requireFamilyMembership(request, familyId)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4002/api/family/me", expect.objectContaining({
      headers: { Authorization: "Bearer verified-token" },
    }));
  });

  it("denies a different family and reports a family-service outage as retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { family: { id: otherFamilyId } } }),
    }));
    await expect(requireFamilyMembership(request, familyId)).rejects.toMatchObject({ statusCode: 403, code: "FAMILY_ACCESS_DENIED" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("unavailable")));
    await expect(requireFamilyMembership(request, familyId)).rejects.toMatchObject({ statusCode: 503, code: "FAMILY_SERVICE_UNAVAILABLE" });
  });
});
