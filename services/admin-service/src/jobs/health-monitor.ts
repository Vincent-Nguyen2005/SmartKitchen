import type { PrismaClient } from ".prisma/client-admin";
import type { HealthTarget } from "../config/health-targets";
import type { HealthStatus } from "../lib/health-stats";

export type HealthPrisma = Pick<PrismaClient, "serviceHealthLog" | "auditLog" | "$transaction">;
type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<{ status: number; ok: boolean; json: () => Promise<unknown> }>;

export type CheckResult = { serviceName: string; status: HealthStatus; responseTimeMs: number | null };
export type Transition = { serviceName: string; from: HealthStatus; to: HealthStatus };
export type PollResult = { checkedAt: Date; results: CheckResult[]; transitions: Transition[]; persisted: boolean; joined?: boolean };

export const SYSTEM_ACTOR = "system";
export const STATUS_CHANGED_ACTION = "SERVICE_STATUS_CHANGED";

/**
 * Classify one /health probe.
 * - no HTTP response (network error / timeout) -> DOWN
 * - non-2xx -> DOWN
 * - 2xx whose body reports DEGRADED, or slower than the threshold -> DEGRADED
 * - otherwise UP
 */
export const classifyHealth = (httpStatus: number | null, body: unknown, responseTimeMs: number | null, degradedThresholdMs: number): HealthStatus => {
  if (httpStatus === null || httpStatus < 200 || httpStatus >= 300) return "DOWN";
  const reported = typeof body === "object" && body !== null ? String((body as { status?: unknown }).status ?? "").toUpperCase() : "";
  if (reported === "DEGRADED") return "DEGRADED";
  if (responseTimeMs !== null && responseTimeMs > degradedThresholdMs) return "DEGRADED";
  return "UP";
};

/** Only crossing the DOWN boundary is a transition worth auditing (goes down / recovers). */
export const isTransition = (previous: HealthStatus | undefined, current: HealthStatus): boolean =>
  previous !== undefined && previous !== current && (previous === "DOWN" || current === "DOWN");

export const checkTarget = async (target: HealthTarget, fetchImpl: FetchLike, timeoutMs: number, degradedThresholdMs: number, now: () => number = Date.now): Promise<CheckResult> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = now();
  try {
    const response = await fetchImpl(`${target.url}/health`, { signal: controller.signal });
    const responseTimeMs = Math.max(0, Math.round(now() - started));
    const body = await response.json().catch(() => null);
    return { serviceName: target.serviceName, status: classifyHealth(response.status, body, responseTimeMs, degradedThresholdMs), responseTimeMs };
  } catch {
    return { serviceName: target.serviceName, status: "DOWN", responseTimeMs: null };
  } finally {
    clearTimeout(timer);
  }
};

type MonitorOptions = {
  prisma: HealthPrisma;
  targets: HealthTarget[];
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  degradedThresholdMs?: number;
  logger?: (event: string, details: Record<string, unknown>) => void;
  clock?: () => Date;
};

const defaultLogger = (event: string, details: Record<string, unknown>): void => {
  console.error(JSON.stringify({ event, ...details }));
};

export const createHealthMonitor = (options: MonitorOptions) => {
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const timeoutMs = options.timeoutMs ?? 2000;
  const degradedThresholdMs = options.degradedThresholdMs ?? 1000;
  const logger = options.logger ?? defaultLogger;
  const clock = options.clock ?? (() => new Date());
  const lastStatus = new Map<string, HealthStatus>();
  let seeded = false;
  let inFlight: Promise<PollResult> | null = null;

  // After a restart, continue from the last persisted status so a restart is not a "transition".
  const seedFromDatabase = async (): Promise<void> => {
    if (seeded) return;
    const latest = await options.prisma.serviceHealthLog.findMany({
      distinct: ["serviceName"],
      orderBy: [{ serviceName: "asc" }, { checkedAt: "desc" }],
      select: { serviceName: true, status: true },
    });
    for (const row of latest) if (!lastStatus.has(row.serviceName)) lastStatus.set(row.serviceName, row.status);
    seeded = true;
  };

  const runPoll = async (): Promise<PollResult> => {
    const checkedAt = clock();
    const results = await Promise.all(options.targets.map((target) => checkTarget(target, fetchImpl, timeoutMs, degradedThresholdMs)));
    try {
      await seedFromDatabase();
    } catch (error) {
      logger("health_monitor_seed_error", { message: error instanceof Error ? error.message : String(error) });
    }
    const transitions: Transition[] = results
      .filter((result) => isTransition(lastStatus.get(result.serviceName), result.status))
      .map((result) => ({ serviceName: result.serviceName, from: lastStatus.get(result.serviceName) as HealthStatus, to: result.status }));
    try {
      await options.prisma.$transaction([
        options.prisma.serviceHealthLog.createMany({ data: results.map((result) => ({ ...result, checkedAt })) }),
        ...transitions.map((transition) => options.prisma.auditLog.create({
          data: {
            adminUserId: SYSTEM_ACTOR,
            action: STATUS_CHANGED_ACTION,
            targetType: "Service",
            targetId: transition.serviceName,
            metadata: { from: transition.from, to: transition.to, checkedAt: checkedAt.toISOString() },
          },
        })),
      ]);
      // Only remember statuses that were persisted, so a failed write retries the transition next poll.
      for (const result of results) lastStatus.set(result.serviceName, result.status);
      return { checkedAt, results, transitions, persisted: true };
    } catch (error) {
      logger("health_monitor_persist_error", { message: error instanceof Error ? error.message : String(error) });
      return { checkedAt, results, transitions: [], persisted: false };
    }
  };

  /** Runs one poll; a call made while a poll is running joins it instead of starting another. */
  const poll = async (): Promise<PollResult> => {
    if (inFlight) return { ...(await inFlight), joined: true };
    inFlight = runPoll().finally(() => { inFlight = null; });
    return inFlight;
  };

  return { poll, isRunning: () => inFlight !== null, targets: options.targets };
};

export type HealthMonitor = ReturnType<typeof createHealthMonitor>;
