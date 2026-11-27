/**
 * Lịch › Theo tuần › "Tạo lại tuần" (pure; covered by weekRebuild.test.ts): rebuilds today and the later days of the
 * shown week with the calorie-based planner (POST /api/menu/generate-days with replace). Only the family OWNER (or a
 * user without a family) may; past days never change.
 */
export const canRebuildWeek = (family: { currentUserRole?: string | null } | null | undefined): boolean =>
  !family || family.currentUserRole === "OWNER";

/** Today and the later days of the week that starts on `from` (YYYY-MM-DD); empty for a past week. */
export function weekRebuildDays(from: string, todayKey: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10)).filter((day) => day >= todayKey);
}

export const WEEK_REBUILD_CONFIRM = {
  title: "Tạo lại thực đơn cả tuần?",
  message: "Thực đơn từ hôm nay đến hết tuần sẽ được gợi ý lại theo Kho và mục tiêu calo của gia đình. Các ngày đã qua giữ nguyên.",
  confirmLabel: "Tạo lại",
} as const;
