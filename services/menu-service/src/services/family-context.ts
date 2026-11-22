import { PrismaClient, type Prisma } from "../../node_modules/.prisma/client-menu";
import { defaultMealTargets, type FamilyHealth, type MealKey, type MemberHealth } from "./family-health";

/**
 * Who a menu is cooked for and their health data: the family's members (family-service
 * GET /internal/families/:id/members) and their profiles (nutrition-service POST /internal/profiles), both with
 * x-api-key = INTERNAL_API_KEY and a short timeout. A user without a family is a family of one.
 *
 * Every complete result is kept in memory for a few minutes and saved as the family's LAST KNOWN context in the menu
 * DB (FamilyHealthContext). If a service is unavailable later, that last known context is used (allergies are never
 * dropped once seen). Only when no context was ever loaded do the defaults apply (no allergies, 2000 kcal), and the
 * result is marked `missing` so the generated menu carries healthUnavailable (the app shows a notice on Lịch).
 * Degraded results are not cached, so the next request retries. Logs counts only.
 */
export const CONTEXT_TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 3000;
const MAX_PROFILES = 20;

export type ContextOwner = { userId: string; familyId: string | null };
export type FamilyContext = FamilyHealth & { degraded: boolean };

/** Where the last known context lives (the menu DB by default; injected in tests). */
export type ContextStore = {
  load: (key: string) => Promise<MemberHealth[] | null>;
  save: (key: string, members: MemberHealth[]) => Promise<void>;
};
let dbClient: PrismaClient | undefined;
export const dbContextStore: ContextStore = {
  load: async (key) => {
    dbClient ??= new PrismaClient();
    const row = await dbClient.familyHealthContext.findUnique({ where: { key } });
    return Array.isArray(row?.members) ? row.members as unknown as MemberHealth[] : null;
  },
  save: async (key, members) => {
    dbClient ??= new PrismaClient();
    const data = members as unknown as Prisma.InputJsonValue;
    await dbClient.familyHealthContext.upsert({ where: { key }, create: { key, members: data }, update: { members: data } });
  },
};

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

export async function loadFamilyContext(owner: ContextOwner, fetchImpl: typeof fetch = fetch, now: number = Date.now(), store: ContextStore = dbContextStore): Promise<FamilyContext> {
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

  if (!degraded) {
    const value: FamilyContext = { members, degraded: false };
    cache.set(cacheKey, { expires: now + CONTEXT_TTL_MS, value });
    await store.save(cacheKey, members).catch(() => console.warn("[menu-service] could not save the last family context"));
    return value;
  }
  // Degraded: the last known context keeps the family's allergies; defaults only when nothing was ever loaded.
  const last = await store.load(cacheKey).catch(() => null);
  if (last && last.length > 0) {
    console.warn(`[menu-service] family context degraded: using the last known context (${last.length} member(s))`);
    return { members: last, degraded: true };
  }
  console.warn(`[menu-service] family context degraded: no earlier context, using defaults for ${members.length} member(s)`);
  return { members, degraded: true, missing: true };
}
