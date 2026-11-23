import { InventoryAuthRequest } from "./auth.middleware";

export class InventoryAccessError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = "InventoryAccessError";
  }
}

export const requireFamilyMembership = async (req: InventoryAuthRequest, familyId: string): Promise<void> => {
  const baseUrl = (process.env.FAMILY_SERVICE_URL || "http://localhost:4002").replace(/\/+$/, "");
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/family/me`, {
      headers: { Authorization: `Bearer ${req.authUser.token}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new InventoryAccessError(503, "FAMILY_SERVICE_UNAVAILABLE", "Family access could not be verified.");
  }
  if (response.status === 404 || response.status === 401 || response.status === 403) {
    throw new InventoryAccessError(403, "FAMILY_ACCESS_DENIED", "You do not have access to this family.");
  }
  if (!response.ok) {
    throw new InventoryAccessError(503, "FAMILY_SERVICE_UNAVAILABLE", "Family access could not be verified.");
  }
  const payload = await response.json().catch(() => null) as { data?: { family?: { id?: unknown } } } | null;
  if (payload?.data?.family?.id !== familyId) {
    throw new InventoryAccessError(403, "FAMILY_ACCESS_DENIED", "You do not have access to this family.");
  }
};

/** The signed-in user's family id (403 when they have no family); for family-wide limits such as photo recognition. */
export const requireAnyFamily = async (req: InventoryAuthRequest): Promise<string> => {
  const baseUrl = (process.env.FAMILY_SERVICE_URL || "http://localhost:4002").replace(/\/+$/, "");
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/family/me`, { headers: { Authorization: `Bearer ${req.authUser.token}` }, signal: AbortSignal.timeout(5000) });
  } catch {
    throw new InventoryAccessError(503, "FAMILY_SERVICE_UNAVAILABLE", "Family access could not be verified.");
  }
  if (response.status === 404 || response.status === 401 || response.status === 403) {
    throw new InventoryAccessError(403, "FAMILY_ACCESS_DENIED", "Join a family to use this feature.");
  }
  if (!response.ok) throw new InventoryAccessError(503, "FAMILY_SERVICE_UNAVAILABLE", "Family access could not be verified.");
  const payload = await response.json().catch(() => null) as { data?: { family?: { id?: unknown } } } | null;
  const familyId = payload?.data?.family?.id;
  if (typeof familyId !== "string") throw new InventoryAccessError(403, "FAMILY_ACCESS_DENIED", "Join a family to use this feature.");
  return familyId;
};
