export type HealthTarget = { serviceName: string; url: string };

type TargetDefinition = { serviceName: string; envKey: string; defaultUrl: string };

// Env keys intentionally match apps/gateway/src/config/routes.ts so one set of
// *_SERVICE_URL variables configures both the gateway and the health monitor.
export const healthTargetDefinitions: TargetDefinition[] = [
  { serviceName: "auth-service", envKey: "AUTH_SERVICE_URL", defaultUrl: "http://localhost:4001" },
  { serviceName: "family-service", envKey: "FAMILY_SERVICE_URL", defaultUrl: "http://localhost:4002" },
  { serviceName: "inventory-service", envKey: "INVENTORY_SERVICE_URL", defaultUrl: "http://localhost:4003" },
  { serviceName: "nutrition-service", envKey: "NUTRITION_SERVICE_URL", defaultUrl: "http://localhost:4004" },
  { serviceName: "meal-diary-service", envKey: "MEAL_DIARY_SERVICE_URL", defaultUrl: "http://localhost:4005" },
  { serviceName: "recipe-service", envKey: "RECIPE_SERVICE_URL", defaultUrl: "http://localhost:4006" },
  { serviceName: "menu-service", envKey: "MENU_SERVICE_URL", defaultUrl: "http://localhost:4007" },
  { serviceName: "shopping-list-service", envKey: "SHOPPING_LIST_SERVICE_URL", defaultUrl: "http://localhost:4008" },
  { serviceName: "payment-service", envKey: "PAYMENT_SERVICE_URL", defaultUrl: "http://localhost:4009" },
  { serviceName: "notification-service", envKey: "NOTIFICATION_SERVICE_URL", defaultUrl: "http://localhost:4010" },
  { serviceName: "admin-service", envKey: "ADMIN_SERVICE_URL", defaultUrl: "http://localhost:4011" },
  { serviceName: "gateway", envKey: "GATEWAY_URL", defaultUrl: "http://localhost:4000" },
];

export const resolveHealthTargets = (env: NodeJS.ProcessEnv = process.env): HealthTarget[] =>
  healthTargetDefinitions.map((definition) => ({
    serviceName: definition.serviceName,
    // A bare host:port (Render private network `hostport`) gets http://.
    url: (env[definition.envKey] || definition.defaultUrl).replace(/^(?![a-z][a-z0-9+.-]*:\/\/)/i, "http://").replace(/\/+$/, ""),
  }));

const positiveNumber = (value: string | undefined, fallback: number, min = 1): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
};

export const healthMonitorConfig = (env: NodeJS.ProcessEnv = process.env) => ({
  jobsEnabled: env.ENABLE_JOBS !== "false",
  pollIntervalSeconds: positiveNumber(env.HEALTH_POLL_INTERVAL_SECONDS, 60, 5),
  // 3s: a 2s budget flagged healthy-but-busy services DOWN while 12 probes run in parallel.
  timeoutMs: positiveNumber(env.HEALTH_CHECK_TIMEOUT_MS, 3000, 100),
  degradedThresholdMs: positiveNumber(env.HEALTH_DEGRADED_THRESHOLD_MS, 1000, 1),
  retentionDays: positiveNumber(env.HEALTH_LOG_RETENTION_DAYS, 14, 1),
});
