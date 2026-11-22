/**
 * Family memberships from family-service (internal route, x-api-key = INTERNAL_API_KEY). Used on every menu request
 * to find the caller's family (menus belong to the family) and by the startup backfill.
 */
export type FamilyRole = "OWNER" | "ADMIN" | "MEMBER";
export type FamilyMembership = { userId: string; familyId: string; role: FamilyRole; memberCount: number };
export type MembershipLookup = (userIds: string[]) => Promise<FamilyMembership[]>;

export class FamilyLookupError extends Error {}

const CHUNK = 500;

/** Memberships of the given users (users without a family are left out). Throws FamilyLookupError when unavailable. */
export const lookupMemberships: MembershipLookup = async (userIds) => {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return [];
  const key = process.env.INTERNAL_API_KEY;
  if (!key) throw new FamilyLookupError("INTERNAL_API_KEY is not configured");
  const baseUrl = (process.env.FAMILY_SERVICE_URL ?? "http://localhost:4002").replace(/\/+$/, "");
  const result: FamilyMembership[] = [];
  for (let start = 0; start < ids.length; start += CHUNK) {
    let response: globalThis.Response;
    try {
      response = await fetch(`${baseUrl}/internal/families/memberships`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key },
        body: JSON.stringify({ userIds: ids.slice(start, start + CHUNK) }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new FamilyLookupError("family-service is unreachable");
    }
    if (!response.ok) throw new FamilyLookupError(`family-service answered ${response.status}`);
    const body = await response.json().catch(() => null) as { items?: unknown } | null;
    if (!Array.isArray(body?.items)) throw new FamilyLookupError("family-service returned an invalid membership list");
    for (const item of body.items as Array<Record<string, unknown>>) {
      if (typeof item.userId === "string" && typeof item.familyId === "string" && typeof item.role === "string") {
        result.push({ userId: item.userId, familyId: item.familyId, role: item.role as FamilyRole, memberCount: typeof item.memberCount === "number" ? item.memberCount : 1 });
      }
    }
  }
  return result;
};
