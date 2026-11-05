type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number; ok: boolean }>;

export type NotifyOutcome = "sent" | "failed" | "skipped";
export type ReporterNotification = { userId: string; reportId: string; status: "RESOLVED" | "REJECTED"; resolutionNote: string | null };

type NotifierOptions = {
  baseUrl: string;
  apiKey: string | undefined;
  timeoutMs?: number;
  retryDelayMs?: number;
  fetchImpl?: FetchLike;
  logger?: (event: string, details: Record<string, unknown>) => void;
  sleep?: (ms: number) => Promise<void>;
};

export const reporterMessage = (notification: ReporterNotification): { title: string; body: string } =>
  notification.status === "RESOLVED"
    ? { title: "Báo cáo của bạn đã được xử lý", body: notification.resolutionNote || "Cảm ơn bạn đã báo cáo. Quản trị viên đã xử lý vấn đề." }
    : { title: "Báo cáo của bạn đã bị từ chối", body: notification.resolutionNote || "Quản trị viên đã xem xét và từ chối báo cáo này." };

/**
 * Best-effort, in-app SYSTEM notification via notification-service POST /internal/notifications.
 * One attempt + one retry on timeout, network error or 5xx; never throws.
 */
export const createReporterNotifier = (options: NotifierOptions) => {
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const timeoutMs = options.timeoutMs ?? 2000;
  const retryDelayMs = options.retryDelayMs ?? 300;
  const logger = options.logger ?? ((event, details) => console.error(JSON.stringify({ event, ...details })));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const url = `${options.baseUrl.replace(/\/+$/, "")}/internal/notifications`;

  const attempt = async (body: string): Promise<"ok" | "retryable" | "fatal"> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": options.apiKey as string },
        body,
        signal: controller.signal,
      });
      if (response.ok) return "ok";
      return response.status >= 500 ? "retryable" : "fatal";
    } catch {
      return "retryable";
    } finally {
      clearTimeout(timer);
    }
  };

  return async (notification: ReporterNotification): Promise<NotifyOutcome> => {
    if (!options.apiKey) {
      logger("report_notification_skipped", { reportId: notification.reportId, reason: "INTERNAL_API_KEY not configured" });
      return "skipped";
    }
    const body = JSON.stringify({
      userId: notification.userId,
      type: "SYSTEM",
      ...reporterMessage(notification),
      data: { reportId: notification.reportId, status: notification.status },
    });
    let result = await attempt(body);
    if (result === "retryable") {
      await sleep(retryDelayMs);
      result = await attempt(body);
    }
    if (result === "ok") return "sent";
    logger("report_notification_failed", { reportId: notification.reportId, result });
    return "failed";
  };
};

export type ReporterNotifier = ReturnType<typeof createReporterNotifier>;
