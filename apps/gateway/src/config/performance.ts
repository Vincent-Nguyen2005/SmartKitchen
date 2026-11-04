const numberEnv = (key: string, fallback: number): number => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const performanceConfig = {
  rateLimitWindowMs: numberEnv("RATE_LIMIT_WINDOW_MS", 60_000),
  rateLimitMax: numberEnv("RATE_LIMIT_MAX", 100),
  authRateLimitMax: numberEnv("AUTH_RATE_LIMIT_MAX", 20),
  cacheTtlMs: numberEnv("CACHE_TTL_SECONDS", 30) * 1000,
  cacheMaxItems: numberEnv("CACHE_MAX_ITEMS", 100),
  trustProxy: process.env.TRUST_PROXY === "true" ? 1 : false,
};

export const cacheablePrefixes = ["/api/recipes/health", "/api/notifications/promotions"];

export const isCacheableRoute = (url: string): boolean => {
  const pathname = new URL(url, "http://gateway").pathname;
  return cacheablePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
};
