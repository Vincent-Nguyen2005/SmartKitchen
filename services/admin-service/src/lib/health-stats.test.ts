import { describe, expect, it } from "vitest";
import { average, bucketize, overallStatus, percentile, summarize, timeseriesRange, uptimePercent, type HealthSample } from "./health-stats";

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

describe("timeseriesRange", () => {
  it("covers the whole 24h summary window with hourly buckets (start rounded down, end up)", () => {
    const range = timeseriesRange("24h", new Date("2026-11-05T10:20:00.000Z"));
    expect(range).toMatchObject({ bucketMs: 3_600_000, count: 25 });
    expect(range.from.toISOString()).toBe("2026-11-04T10:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-11-05T11:00:00.000Z");
  });

  it("covers the whole 7d window with six-hour buckets aligned to 00/06/12/18 UTC", () => {
    const range = timeseriesRange("7d", new Date("2026-11-05T10:20:00.000Z"));
    expect(range).toMatchObject({ bucketMs: 6 * 3_600_000, count: 29 });
    expect(range.from.toISOString()).toBe("2026-10-29T06:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-11-05T12:00:00.000Z");
  });

  it("uses exactly 24 / 28 buckets when now is on a boundary", () => {
    expect(timeseriesRange("24h", new Date("2026-11-05T10:00:00.000Z"))).toMatchObject({ count: 24 });
    expect(timeseriesRange("7d", new Date("2026-11-05T12:00:00.000Z"))).toMatchObject({ count: 28 });
  });

  it("puts every sample the summary counts into a bucket (regression: oldest part of the window was dropped)", () => {
    const now = new Date("2026-11-05T17:03:44.000Z");
    const range = timeseriesRange("24h", now);
    const oldest = { serviceName: "gateway", status: "DOWN" as const, responseTimeMs: null, checkedAt: new Date(now.getTime() - 23 * 3_600_000 - 50 * 60_000) };
    const buckets = bucketize([oldest], range.from, range.bucketMs, range.count);
    expect(buckets.reduce((sum, bucket) => sum + bucket.samples, 0)).toBe(1);
    expect(buckets[0]).toMatchObject({ samples: 1, uptimePercent: 0 });
  });
});

describe("bucketize", () => {
  const from = new Date(Date.UTC(2026, 10, 4, 0, 0));
  const hour = 3_600_000;

  it("applies the summary math per bucket and keeps empty buckets with nulls", () => {
    const rows = [
      sample("auth-service", "UP", 10, 1),
      sample("auth-service", "DOWN", null, 30),
      sample("auth-service", "DEGRADED", 30, 59),
      { ...sample("auth-service", "UP", 50, 0), checkedAt: new Date(from.getTime() + 2 * hour + 60_000) },
    ];
    const buckets = bucketize(rows, from, hour, 3);
    expect(buckets).toHaveLength(3);
    expect(buckets[0]).toMatchObject({ samples: 3, uptimePercent: 66.67, avgResponseTimeMs: 20, p95ResponseTimeMs: 30 });
    expect(buckets[1]).toMatchObject({ samples: 0, uptimePercent: null, avgResponseTimeMs: null, p95ResponseTimeMs: null });
    expect(buckets[2]).toMatchObject({ samples: 1, uptimePercent: 100, avgResponseTimeMs: 50 });
    expect(buckets[1].start.toISOString()).toBe("2026-11-04T01:00:00.000Z");
    expect(buckets[1].end.toISOString()).toBe("2026-11-04T02:00:00.000Z");
  });

  it("ignores samples outside the window", () => {
    const before = { ...sample("gateway", "UP", 5, 0), checkedAt: new Date(from.getTime() - 1) };
    const after = { ...sample("gateway", "UP", 5, 0), checkedAt: new Date(from.getTime() + 2 * hour) };
    expect(bucketize([before, after], from, hour, 2).every((bucket) => bucket.samples === 0)).toBe(true);
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
