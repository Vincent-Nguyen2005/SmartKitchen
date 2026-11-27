/**
 * Quản trị › Nguyên liệu / Món ăn pager (pure; covered by pager.test.ts): « ‹ [up to 3 page numbers around the
 * current one] › ». Disabled ends are dimmed; nothing is shown for a single page.
 */
export type PagerStep = { key: "first" | "prev" | "next" | "last"; label: string; target: number; enabled: boolean };
export type PagerModel = { before: PagerStep[]; pages: Array<{ number: number; current: boolean }>; after: PagerStep[] } | null;

/** At most `size` consecutive page numbers, centred on `current` where possible (7 of 20, size 3 → 6, 7, 8). */
export const pageWindow = (current: number, totalPages: number, size = 3): number[] => {
  const start = Math.max(1, Math.min(current - Math.floor(size / 2), totalPages - size + 1));
  const end = Math.min(totalPages, start + size - 1);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
};

export function pagerModel(page: number, totalPages: number, disabled = false): PagerModel {
  if (totalPages <= 1) return null;
  const step = (key: PagerStep["key"], label: string, target: number): PagerStep =>
    ({ key, label, target, enabled: !disabled && target >= 1 && target <= totalPages && target !== page });
  return {
    before: [step("first", "Trang đầu", 1), step("prev", "Trang trước", page - 1)],
    pages: pageWindow(page, totalPages).map((number) => ({ number, current: number === page })),
    after: [step("next", "Trang sau", page + 1), step("last", "Trang cuối", totalPages)],
  };
}
