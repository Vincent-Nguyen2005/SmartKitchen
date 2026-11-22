import { FamilyLookupError, lookupMemberships, type MembershipLookup } from "./family-client";
import { MenuServiceError, type MenuOwner } from "./menu.service";

/**
 * The caller's menu owner: their family (menus belong to the family, membership checked with family-service) or,
 * without a family, the user (personal menus as before). A requested familyId that is not the caller's family is
 * refused (403). family-service unavailable → 503, never a silent switch to personal menus.
 */
export async function resolveMenuOwner(userId: string, requestedFamilyId?: string, lookup: MembershipLookup = lookupMemberships): Promise<MenuOwner> {
  let memberships;
  try {
    memberships = await lookup([userId]);
  } catch (error) {
    if (error instanceof FamilyLookupError) console.error("[menu-service] family lookup failed:", error.message);
    throw new MenuServiceError("Không kiểm tra được gia đình. Hãy thử lại sau.", 503);
  }
  const membership = memberships.find((entry) => entry.userId === userId);
  if (requestedFamilyId && membership?.familyId !== requestedFamilyId) throw new MenuServiceError("Bạn không thuộc gia đình này.", 403);
  return membership
    ? { userId, familyId: membership.familyId, role: membership.role, memberCount: membership.memberCount }
    : { userId, familyId: null };
}
