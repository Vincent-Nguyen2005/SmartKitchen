/**
 * Quản trị › "Tổng quan" numbers (pure; covered by overviewStats.test.ts). The former "Thống kê" tab's unique cards
 * (services up / slow / down, services with a problem, open and resolved reports, new users) live here now.
 */
import { needsAttention, severityOf, type ServiceStatus } from "./healthTriage";

export const NEW_USER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * New users in the last NEW_USER_DAYS from the newest page (auth-service has no "created after" filter). When every
 * row of the page is recent and there are more users, the true number is higher: "100+".
 */
export function countNewUsers(page: { items: Array<{ createdAt: string }>; total: number }, now: number): string {
  const since = now - NEW_USER_DAYS * DAY_MS;
  const recent = page.items.filter((user) => new Date(user.createdAt).getTime() >= since).length;
  return recent === page.items.length && page.total > page.items.length ? `${recent}+` : String(recent);
}

export const shortServiceName = (serviceName: string): string => serviceName.replace(/-service$/, "");

export type ServiceSummary = { up: number; slow: number; down: number; unmeasured: number; total: number; problems: string[] };

/** Counts per status and the services that need attention (down, or slow by status or p95). */
export function servicesSummary(services: Array<{ serviceName: string; status: ServiceStatus }>, p95ByName: ReadonlyMap<string, number | null>): ServiceSummary {
  const summary: ServiceSummary = { up: 0, slow: 0, down: 0, unmeasured: 0, total: services.length, problems: [] };
  for (const service of services) {
    if (service.status === "UP") summary.up += 1;
    else if (service.status === "DEGRADED") summary.slow += 1;
    else if (service.status === "DOWN") summary.down += 1;
    else summary.unmeasured += 1;
    if (needsAttention(severityOf(service.status, p95ByName.get(service.serviceName) ?? null))) summary.problems.push(shortServiceName(service.serviceName));
  }
  return summary;
}

/** "14/15 dịch vụ hoạt động · Chậm 0 · Ngừng 1" (+ "· Chưa đo 1" when some were never measured). */
export const servicesDetail = (summary: ServiceSummary): string =>
  `${summary.up}/${summary.total} dịch vụ hoạt động · Chậm ${summary.slow} · Ngừng ${summary.down}${summary.unmeasured ? ` · Chưa đo ${summary.unmeasured}` : ""}`;

/** "2 đang xem xét · 3 đã xử lý (24 giờ)". */
export const reportsDetail = (stats: { byStatus: { IN_REVIEW?: number }; resolvedInWindow?: number | null }): string =>
  `${stats.byStatus.IN_REVIEW ?? 0} đang xem xét · ${stats.resolvedInWindow ?? 0} đã xử lý (24 giờ)`;
