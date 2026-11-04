import { describe, expect, it, vi } from "vitest";
import { createReporterNotifier, reporterMessage } from "./notify-client";

const notification = { userId: "user-1", reportId: "r1", status: "RESOLVED" as const, resolutionNote: "Warned the user" };
const noSleep = () => Promise.resolve();

describe("reporter notifier", () => {
  it("posts an in-app SYSTEM notification with the internal API key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 201, ok: true });
    const notify = createReporterNotifier({ baseUrl: "http://notification-service:4010/", apiKey: "k", fetchImpl, sleep: noSleep });
    await expect(notify(notification)).resolves.toBe("sent");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://notification-service:4010/internal/notifications");
    expect(init.headers["x-api-key"]).toBe("k");
    expect(JSON.parse(init.body)).toMatchObject({ userId: "user-1", type: "SYSTEM", body: "Warned the user", data: { reportId: "r1", status: "RESOLVED" } });
  });

  it("retries exactly once after a 5xx and reports success", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ status: 503, ok: false }).mockResolvedValueOnce({ status: 201, ok: true });
    const notify = createReporterNotifier({ baseUrl: "http://n", apiKey: "k", fetchImpl, sleep: noSleep });
    await expect(notify(notification)).resolves.toBe("sent");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry on network errors without throwing", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const logger = vi.fn();
    const notify = createReporterNotifier({ baseUrl: "http://n", apiKey: "k", fetchImpl, logger, sleep: noSleep });
    await expect(notify(notification)).resolves.toBe("failed");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(logger).toHaveBeenCalledWith("report_notification_failed", { reportId: "r1", result: "retryable" });
  });

  it("does not retry client errors such as a wrong API key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 401, ok: false });
    const notify = createReporterNotifier({ baseUrl: "http://n", apiKey: "wrong", fetchImpl, logger: vi.fn(), sleep: noSleep });
    await expect(notify(notification)).resolves.toBe("failed");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("times out a hanging request and retries once", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise<never>((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      }));
      const notify = createReporterNotifier({ baseUrl: "http://n", apiKey: "k", timeoutMs: 1000, fetchImpl, logger: vi.fn(), sleep: noSleep });
      const pending = notify(notification);
      await vi.advanceTimersByTimeAsync(2500);
      await expect(pending).resolves.toBe("failed");
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips without calling the network when no internal API key is configured", async () => {
    const fetchImpl = vi.fn();
    const notify = createReporterNotifier({ baseUrl: "http://n", apiKey: undefined, fetchImpl, logger: vi.fn() });
    await expect(notify(notification)).resolves.toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses a default message when the admin left no note", () => {
    expect(reporterMessage({ ...notification, status: "REJECTED", resolutionNote: null }).body).toContain("từ chối");
  });
});
