import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startHealthJobs } from "./scheduler";
import type { HealthMonitor } from "./health-monitor";

const monitorWith = (poll: () => Promise<unknown>) => ({ poll, isRunning: () => false, targets: [] }) as unknown as HealthMonitor;

describe("startHealthJobs", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("does not poll during startup and polls once per interval afterwards", async () => {
    const poll = vi.fn().mockResolvedValue({ transitions: [] });
    const jobs = startHealthJobs({ monitor: monitorWith(poll), pollIntervalSeconds: 60, purge: vi.fn().mockResolvedValue(0), logger: vi.fn() });
    expect(poll).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(poll).toHaveBeenCalledTimes(3);
    jobs.stop();
  });

  it("logs poll and purge failures instead of crashing the process", async () => {
    const logger = vi.fn();
    const jobs = startHealthJobs({
      monitor: monitorWith(vi.fn().mockRejectedValue(new Error("poll boom"))),
      pollIntervalSeconds: 10,
      purge: vi.fn().mockRejectedValue(new Error("purge boom")),
      logger,
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(logger).toHaveBeenCalledWith("health_monitor_job_error", { message: "poll boom" });
    expect(logger).toHaveBeenCalledWith("health_log_retention_error", { message: "purge boom" });
    jobs.stop();
  });

  it("runs the first retention purge shortly after startup and then daily", async () => {
    const purge = vi.fn().mockResolvedValue(5);
    const logger = vi.fn();
    const jobs = startHealthJobs({ monitor: monitorWith(vi.fn().mockResolvedValue({ transitions: [] })), pollIntervalSeconds: 3600, purge, logger });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(purge).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith("health_log_retention", { deleted: 5 });
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(purge).toHaveBeenCalledTimes(2);
    jobs.stop();
  });

  it("stops all timers on stop()", async () => {
    const poll = vi.fn().mockResolvedValue({ transitions: [] });
    startHealthJobs({ monitor: monitorWith(poll), pollIntervalSeconds: 10, purge: vi.fn().mockResolvedValue(0), logger: vi.fn() }).stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poll).not.toHaveBeenCalled();
  });
});
