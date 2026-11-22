import { defaultMealTargets, type FamilyHealth, type MealKey, type MemberHealth } from "./family-health";

/**
 * Who a menu is cooked for and their health data: the family's members (family-service
 * GET /internal/families/:id/members) and their profiles (nutrition-service POST /internal/profiles), both with
 * x-api-key = INTERNAL_API_KEY and a short timeout. A user without a family is a family of one.
 *
 * If a service is unavailable the menu is still generated: unknown members fall back to the caller alone, unknown
 * profiles to the default targets with no allergies or conditions; this is logged with counts only. Complete results
 * are cached per family for a few minutes; degraded ones are not cached, so the next request retries.
 */
export const CONTEXT_TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 3000;
const MAX_PROFILES = 20;

export type ContextOwner = { userId: string; familyId: string | null };
export type FamilyContext = FamilyHealth & { degraded: boolean };

const cache = new Map<string, { expires: number; value: FamilyContext }>();
export const clearFamilyContextCache = (): void => cache.clear();

const defaultMember = (userId: string, name: string | null): MemberHealth => ({ userId, name, allergies: [], conditions: [], mealTargets: defaultMealTargets() });

async function requestJson(fetchImpl: typeof fetch, url: string, body?: unknown): Promise<unknown> {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) throw new Error("INTERNAL_API_KEY is not configured");
  const response = await fetchImpl(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-api-key": key, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`status ${response.status}`);
  return response.json();
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []);

export async function loadFamilyContext(owner: ContextOwner, fetchImpl: typeof fetch = fetch, now: number = Date.now()): Promise<FamilyContext> {
  const cacheKey = owner.familyId ? `family:${owner.familyId}` : `user:${owner.userId}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > now) return hit.value;

  let degraded = false;
  let people: Array<{ userId: string; name: string | null }> = [{ userId: owner.userId, name: null }];
  if (owner.familyId) {
    try {
      const familyUrl = (process.env.FAMILY_SERVICE_URL ?? "http://localhost:4002").replace(/\/+$/, "");
      const body = await requestJson(fetchImpl, `${familyUrl}/internal/families/${encodeURIComponent(owner.familyId)}/members`) as { items?: Array<{ userId?: unknown; name?: unknown }> };
      const listed = (body.items ?? []).flatMap((item) => (typeof item.userId === "string" ? [{ userId: item.userId, name: typeof item.name === "string" ? item.name : null }] : []));
      if (listed.length > 0) people = listed;
    } catch {
      degraded = true;
    }
  }

  let members = people.map((person) => defaultMember(person.userId, person.name));
  try {
    const nutritionUrl = (process.env.NUTRITION_SERVICE_URL ?? "http://localhost:4004").replace(/\/+$/, "");
    const body = await requestJson(fetchImpl, `${nutritionUrl}/internal/profiles`, { userIds: people.slice(0, MAX_PROFILES).map((person) => person.userId) }) as { items?: Array<Record<string, unknown>> };
    const byUser = new Map((body.items ?? []).map((item) => [item.userId, item]));
    members = members.map((member) => {
      const profile = byUser.get(member.userId);
      if (!profile) return member;
      const targets = (profile.mealTargets ?? {}) as Record<MealKey, { calories?: unknown } | undefined>;
      const kcal = (meal: MealKey) => (typeof targets[meal]?.calories === "number" ? targets[meal]!.calories as number : member.mealTargets[meal]);
      return {
        ...member,
        allergies: strings(profile.allergies),
        conditions: strings(profile.conditions),
        mealTargets: { breakfast: kcal("breakfast"), lunch: kcal("lunch"), dinner: kcal("dinner") },
      };
    });
  } catch {
    degraded = true;
  }

  if (degraded) {
    console.warn(`[menu-service] family context degraded: ${members.length} member(s), using defaults where data was unavailable`);
  }
  const value: FamilyContext = { members, degraded };
  if (!degraded) cache.set(cacheKey, { expires: now + CONTEXT_TTL_MS, value });
  return value;
}
