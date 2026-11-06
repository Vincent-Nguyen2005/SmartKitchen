/** Prisma connection and pool failures should be reported as temporary outages. */
export const isDatabaseUnavailable = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; name?: unknown };
  return ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(String(value.code))
    || value.name === "PrismaClientInitializationError";
};
