import { z } from "zod";

export const expiringQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(3),
  familyId: z.string().uuid().optional(),
});

export type ExpiringQuery = z.infer<typeof expiringQuerySchema>;
