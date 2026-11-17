import { z } from "zod";

const profileResult = z.object({
  items: z.array(z.object({ id: z.string(), email: z.string(), name: z.string().nullable() })),
});
export type Profile = z.infer<typeof profileResult>["items"][number];
export class ProfileLookupError extends Error {}

export const lookupProfiles = async (ids: string[]): Promise<Map<string, Profile>> => {
  if (!ids.length) return new Map();
  try {
    const target = (process.env.AUTH_SERVICE_URL || "http://localhost:4001").replace(/\/$/, "");
    const response = await fetch(`${target}/internal/admin/users/profiles`, {
      method: "POST",
      headers: {
        "x-api-key": process.env.INTERNAL_API_KEY || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: [...new Set(ids)] }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Profile service returned ${response.status}`);
    const parsed = profileResult.parse(await response.json());
    return new Map(parsed.items.map((profile) => [profile.id, profile]));
  } catch (error) {
    console.error("[family-service] auth profile lookup failed", error);
    throw new ProfileLookupError("Unable to load user profiles");
  }
};
