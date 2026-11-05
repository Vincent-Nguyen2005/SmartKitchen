import { AppError } from "../lib/app-error";
import { ShoppingAuthRequest } from "./auth.middleware";

export const requireFamilyMembership = async (req: ShoppingAuthRequest, familyId: string): Promise<void> => {
  const baseUrl = (process.env.FAMILY_SERVICE_URL || "http://localhost:4002").replace(/\/+$/, "");
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/family/me`, {
      headers: { Authorization: `Bearer ${req.authUser.token}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new AppError(503, "FAMILY_SERVICE_UNAVAILABLE", "Family access could not be verified.");
  }
  if (response.status === 404 || response.status === 401 || response.status === 403) {
    throw new AppError(403, "FAMILY_ACCESS_DENIED", "You do not have access to this family.");
  }
  if (!response.ok) throw new AppError(503, "FAMILY_SERVICE_UNAVAILABLE", "Family access could not be verified.");
  const payload = await response.json().catch(() => null) as { data?: { family?: { id?: unknown } } } | null;
  if (payload?.data?.family?.id !== familyId) throw new AppError(403, "FAMILY_ACCESS_DENIED", "You do not have access to this family.");
};
