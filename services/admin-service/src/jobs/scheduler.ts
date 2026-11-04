import type { HealthMonitor } from "./health-monitor";

type SchedulerOptions = {
  monitor: HealthMonitor;
  pollIntervalSeconds: number;
  purge: () => Promise<number>;
  logger?: (event: string, details: Record<string, unknown>) => void;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Starts background jobs without blocking startup. Every run is caught and logged;
 * timers are unref'd so they never keep the process alive on shutdown.
 */
export const startHealthJobs = (options: SchedulerOptions): { stop: () => void } => {
  const log = options.logger ?? ((event, details) => console.log(JSON.stringify({ event, ...details })));
  let purging = false;

  const pollJob = (): void => {
    void options.monitor.poll()
      .then((result) => { if (result.transitions.length > 0) log("health_monitor_transitions", { transitions: result.transitions }); })
      .catch((error: unknown) => log("health_monitor_job_error", { message: error instanceof Error ? error.message : String(error) }));
  };
  const purgeJob = (): void => {
    if (purging) return;
    purging = true;
    void options.purge()
      .then((count) => log("health_log_retention", { deleted: count }))
      .catch((error: unknown) => log("health_log_retention_error", { message: error instanceof Error ? error.message : String(error) }))
      .finally(() => { purging = false; });
  };

  const timers = [
    setInterval(pollJob, options.pollIntervalSeconds * 1000),
    setTimeout(purgeJob, 30_000),
    setInterval(purgeJob, DAY_MS),
  ];
  timers.forEach((timer) => timer.unref());
  return { stop: () => timers.forEach((timer) => clearInterval(timer)) };
};
