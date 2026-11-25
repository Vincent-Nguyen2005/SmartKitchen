/**
 * Nấu ăn "Hoàn thành": what to take out of Kho for the dish (inventory-service POST /api/inventory/cook).
 * Pure helpers (no React Native), covered by cookFromKho.test.ts.
 */
export type CookIngredient = { name: string; quantity: number | null; unit: string | null; isSeasoning?: boolean };
export type CookLine = { name: string; quantity: number; unit: string };

/**
 * The dish's measured ingredients (already scaled to the people it is cooked for): seasonings and free-text amounts
 * ("vừa ăn", "1 muỗng canh") are left out, like in "Cần mua tuần này". The same ingredient twice is summed.
 */
export function cookLines(ingredients: CookIngredient[]): CookLine[] {
  const lines = new Map<string, CookLine>();
  for (const ingredient of ingredients) {
    const name = ingredient.name.trim();
    const unit = ingredient.unit?.trim();
    if (ingredient.isSeasoning || !name || !unit || typeof ingredient.quantity !== "number" || !(ingredient.quantity > 0)) continue;
    const key = `${name.toLocaleLowerCase("vi")}|${unit.toUpperCase()}`;
    const existing = lines.get(key);
    if (existing) existing.quantity = Math.round((existing.quantity + ingredient.quantity) * 1000) / 1000;
    else lines.set(key, { name, quantity: ingredient.quantity, unit });
  }
  return [...lines.values()].slice(0, 60);
}

/** Random v4 UUID for one "Hoàn thành" tap (a retried request with it changes Kho only once). */
export function newCookId(random: () => number = Math.random): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Toast after cooking: what Kho could not cover (if anything). */
export function cookSummary(lines: Array<{ name: string; missing: number }>): string {
  const short = lines.filter((line) => line.missing > 0).map((line) => line.name);
  if (short.length === 0) return "Đã trừ nguyên liệu trong Kho";
  return `Đã trừ trong Kho; Kho không đủ: ${short.slice(0, 3).join(", ")}${short.length > 3 ? "…" : ""}`;
}
