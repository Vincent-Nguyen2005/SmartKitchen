export type HealthStatus = "UP" | "DOWN" | "DEGRADED";
export type OverallStatus = HealthStatus | "UNKNOWN";

export type HealthSample = {
  serviceName: string;
  status: HealthStatus;
  responseTimeMs: number | null;
  checkedAt: Date;
};

export type ServiceSummary = {
  serviceName: string;
  samples: number;
  uptimePercent: number | null;
  avgResponseTimeMs: number | null;
  p95ResponseTimeMs: number | null;
  lastStatus: HealthStatus | null;
  lastCheckedAt: Date | null;
};

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Nearest-rank percentile (no interpolation); null when there are no values. */
export const percentile = (values: number[], p: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
};

export const average = (values: number[]): number | null =>
  values.length === 0 ? null : round(values.reduce((sum, value) => sum + value, 0) / values.length);

/** DEGRADED still serves traffic, so it counts as available for uptime. */
export const uptimePercent = (statuses: HealthStatus[]): number | null => {
  if (statuses.length === 0) return null;
  const available = statuses.filter((status) => status !== "DOWN").length;
  return round((available / statuses.length) * 100);
};

export const summarizeService = (serviceName: string, samples: HealthSample[]): ServiceSummary => {
  const ordered = [...samples].sort((a, b) => a.checkedAt.getTime() - b.checkedAt.getTime());
  const times = ordered.map((sample) => sample.responseTimeMs).filter((value): value is number => typeof value === "number");
  const last = ordered[ordered.length - 1];
  return {
    serviceName,
    samples: ordered.length,
    uptimePercent: uptimePercent(ordered.map((sample) => sample.status)),
    avgResponseTimeMs: average(times),
    p95ResponseTimeMs: percentile(times, 95),
    lastStatus: last?.status ?? null,
    lastCheckedAt: last?.checkedAt ?? null,
  };
};

export const summarize = (serviceNames: string[], samples: HealthSample[]): ServiceSummary[] => {
  const byService = new Map<string, HealthSample[]>(serviceNames.map((name) => [name, []]));
  for (const sample of samples) {
    const bucket = byService.get(sample.serviceName) ?? [];
    bucket.push(sample);
    byService.set(sample.serviceName, bucket);
  }
  return [...byService.entries()].map(([name, rows]) => summarizeService(name, rows));
};

export const overallStatus = (statuses: (HealthStatus | null)[]): OverallStatus => {
  const known = statuses.filter((status): status is HealthStatus => status !== null);
  if (known.length === 0) return "UNKNOWN";
  const allKnown = known.length === statuses.length;
  if (allKnown && known.every((status) => status === "UP")) return "UP";
  if (allKnown && known.every((status) => status === "DOWN")) return "DOWN";
  return "DEGRADED";
};

export const summaryWindows = { "24h": 24 * 60 * 60 * 1000, "7d": 7 * 24 * 60 * 60 * 1000 } as const;
export type SummaryWindow = keyof typeof summaryWindows;

const HOUR_MS = 60 * 60 * 1000;
/** Bucket size per window: 1h buckets for 24h, 6h buckets for 7d. */
export const timeseriesBuckets: Record<SummaryWindow, number> = { "24h": HOUR_MS, "7d": 6 * HOUR_MS };

export type TimeseriesBucket = {
  start: Date;
  end: Date;
  samples: number;
  uptimePercent: number | null;
  avgResponseTimeMs: number | null;
  p95ResponseTimeMs: number | null;
};

/**
 * Bucket boundaries covering the whole summary window [now - window, now], aligned to multiples of the
 * bucket size (UTC epoch) so edges stay stable between refreshes: the start is rounded down and the end
 * up. That gives 25 hourly buckets for 24h (24 when `now` is on the hour) and 29 six-hour buckets for 7d
 * (28 on a boundary), and every sample the summary counts falls into a bucket.
 */
export const timeseriesRange = (window: SummaryWindow, now: Date): { from: Date; to: Date; bucketMs: number; count: number } => {
  const bucketMs = timeseriesBuckets[window];
  const start = Math.floor((now.getTime() - summaryWindows[window]) / bucketMs) * bucketMs;
  const end = Math.ceil(now.getTime() / bucketMs) * bucketMs;
  return { from: new Date(start), to: new Date(end), bucketMs, count: (end - start) / bucketMs };
};

/** Same math as the summary (uptime %, average, nearest-rank p95), per time bucket. Empty buckets are kept with nulls. */
export const bucketize = (samples: HealthSample[], from: Date, bucketMs: number, count: number): TimeseriesBucket[] => {
  const groups: HealthSample[][] = Array.from({ length: count }, () => []);
  for (const sample of samples) {
    const index = Math.floor((sample.checkedAt.getTime() - from.getTime()) / bucketMs);
    if (index >= 0 && index < count) groups[index].push(sample);
  }
  return groups.map((rows, index) => {
    const times = rows.map((row) => row.responseTimeMs).filter((value): value is number => typeof value === "number");
    return {
      start: new Date(from.getTime() + index * bucketMs),
      end: new Date(from.getTime() + (index + 1) * bucketMs),
      samples: rows.length,
      uptimePercent: uptimePercent(rows.map((row) => row.status)),
      avgResponseTimeMs: average(times),
      p95ResponseTimeMs: percentile(times, 95),
    };
  });
};
