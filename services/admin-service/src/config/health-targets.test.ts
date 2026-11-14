import { describe, expect, it } from "vitest";
import { healthMonitorConfig, resolveHealthTargets } from "./health-targets";

describe("resolveHealthTargets", () => {
  it("covers the 11 services plus the gateway with localhost defaults", () => {
    const targets = resolveHealthTargets({});
    expect(targets).toHaveLength(12);
    expect(targets.find((target) => target.serviceName === "gateway")?.url).toBe("http://localhost:4000");
    expect(targets.find((target) => target.serviceName === "admin-service")?.url).toBe("http://localhost:4011");
  });

  it("uses the same *_SERVICE_URL variables as the gateway and trims trailing slashes", () => {
    const targets = resolveHealthTargets({ AUTH_SERVICE_URL: "http://auth-service:4001/", GATEWAY_URL: "http://gateway:4000" });
    expect(targets.find((target) => target.serviceName === "auth-service")?.url).toBe("http://auth-service:4001");
    expect(targets.find((target) => target.serviceName === "gateway")?.url).toBe("http://gateway:4000");
  });

  it("adds http:// to a bare host:port from Render's private network", () => {
    const targets = resolveHealthTargets({ AUTH_SERVICE_URL: "smartkitchen-auth:4001", GATEWAY_URL: "https://api.example.com/" });
    expect(targets.find((target) => target.serviceName === "auth-service")?.url).toBe("http://smartkitchen-auth:4001");
    expect(targets.find((target) => target.serviceName === "gateway")?.url).toBe("https://api.example.com");
  });
});

describe("healthMonitorConfig", () => {
  it("defaults to a 60s poll, 3s timeout and 14 days retention with jobs enabled", () => {
    expect(healthMonitorConfig({})).toEqual({ jobsEnabled: true, pollIntervalSeconds: 60, timeoutMs: 3000, degradedThresholdMs: 1000, retentionDays: 14 });
  });

  it("disables jobs only when ENABLE_JOBS is exactly false and rejects invalid numbers", () => {
    const config = healthMonitorConfig({ ENABLE_JOBS: "false", HEALTH_POLL_INTERVAL_SECONDS: "1", HEALTH_LOG_RETENTION_DAYS: "abc" });
    expect(config.jobsEnabled).toBe(false);
    expect(config.pollIntervalSeconds).toBe(60);
    expect(config.retentionDays).toBe(14);
  });

  it("accepts a short poll interval for local testing", () => {
    expect(healthMonitorConfig({ HEALTH_POLL_INTERVAL_SECONDS: "10" }).pollIntervalSeconds).toBe(10);
  });
});
