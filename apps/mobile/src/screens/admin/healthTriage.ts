/**
 * Shared triage for the Thống kê and Hệ thống tabs, so "Dịch vụ có vấn đề" on one matches the cards
 * shown on the other. A service needs attention when it is down, degraded, has never been measured
 * (we cannot claim it is healthy), or is slow (p95 above SLOW_P95_MS) even though it reports UP.
 */
export type ServiceStatus = "UP" | "DOWN" | "DEGRADED" | null;

export const SLOW_P95_MS = 300;

/** Lower = more urgent. Order: down, degraded, no data, slow, healthy. */
export enum Severity {
  Down = 0,
  Degraded = 1,
  Unknown = 2,
  Slow = 3,
  Healthy = 4,
}

export const severityOf = (status: ServiceStatus, p95ResponseTimeMs: number | null | undefined): Severity => {
  if (status === "DOWN") return Severity.Down;
  if (status === "DEGRADED") return Severity.Degraded;
  if (status === null) return Severity.Unknown;
  if (typeof p95ResponseTimeMs === "number" && p95ResponseTimeMs > SLOW_P95_MS) return Severity.Slow;
  return Severity.Healthy;
};

export const needsAttention = (severity: Severity): boolean => severity !== Severity.Healthy;
