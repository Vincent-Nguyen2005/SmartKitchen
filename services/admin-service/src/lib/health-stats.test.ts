import { describe, expect, it } from "vitest";
import { average, overallStatus, percentile, summarize, uptimePercent, type HealthSample } from "./health-stats";

const sample = (serviceName: string, status: HealthSample["status"], responseTimeMs: number | null, minute: number): HealthSample =>
  ({ serviceName, status, responseTimeMs, checkedAt: new Date(Date.UTC(2026, 10, 4, 0, minute)) });

describe("percentile (nearest rank)", () => {
  it("returns null for an empty series", () => {
    expect(percentile([], 95)).toBeNull();
  });

  it("returns the single value for a one-element series", () => {
    expect(percentile([42], 95)).toBe(42);
  });

  it("picks the 95th value of 1..100 regardless of input order", () => {
    const values = Array.from({ length: 100 }, (_, index) => 100 - index);
    expect(percentile(values, 95)).toBe(95);
  });

  it("picks the max for small series where ceil(0.95n) equals n", () => {
    expect(percentile([10, 20, 30, 40, 500], 95)).toBe(500);
  });
});

describe("uptime and average", () => {
  it("counts DEGRADED as available and DOWN as unavailable", () => {
    expect(uptimePercent(["UP", "DEGRADED", "DOWN", "UP"])).toBe(75);
  });

  it("rounds uptime to two decimals", () => {
    expect(uptimePercent(["UP", "UP", "DOWN"])).toBe(66.67);
  });

  it("returns null uptime and average without samples", () => {
    expect(uptimePercent([])).toBeNull();
    expect(average([])).toBeNull();
  });
});

describe("summarize", () => {
  it("reports per-service uptime, avg and p95 ignoring timeouts without a response time", () => {
    const rows = [
      sample("auth-service", "UP", 10, 1),
      sample("auth-service", "UP", 30, 2),
      sample("auth-service", "DOWN", null, 3),
      sample("auth-service", "UP", 20, 4),
    ];
    const [auth] = summarize(["auth-service"], rows);
    expect(auth).toMatchObject({ serviceName: "auth-service", samples: 4, uptimePercent: 75, avgResponseTimeMs: 20, p95ResponseTimeMs: 30, lastStatus: "UP" });
    expect(auth.lastCheckedAt?.toISOString()).toBe("2026-11-04T00:04:00.000Z");
  });

  it("includes configured services that have no samples yet", () => {
    const result = summarize(["auth-service", "gateway"], [sample("auth-service", "UP", 5, 1)]);
    expect(result.find((row) => row.serviceName === "gateway")).toMatchObject({ samples: 0, uptimePercent: null, lastStatus: null });
  });
});

describe("overallStatus", () => {
  it("is UP only when every service is known and UP", () => {
    expect(overallStatus(["UP", "UP"])).toBe("UP");
    expect(overallStatus(["UP", null])).toBe("DEGRADED");
  });

  it("is DOWN when every known service is DOWN and DEGRADED when mixed", () => {
    expect(overallStatus(["DOWN", "DOWN"])).toBe("DOWN");
    expect(overallStatus(["UP", "DOWN"])).toBe("DEGRADED");
    expect(overallStatus(["DOWN", null])).toBe("DEGRADED");
  });

  it("is UNKNOWN before any poll has been recorded", () => {
    expect(overallStatus([null, null])).toBe("UNKNOWN");
  });
});
