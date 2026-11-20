import type { InventoryUnit } from "./inventoryApi";

export type ReceiptQrItem = { name: string; quantity: number; unit: InventoryUnit };

const validUnits: ReadonlySet<string> = new Set([
  "PIECE", "PACK", "BOX", "BOTTLE", "CAN", "GRAM", "KILOGRAM", "MILLILITER", "LITER",
]);

/** Only structured line items are importable. A payment/invoice URL is not a shopping list. */
export function parseReceiptQr(raw: string): ReceiptQrItem[] | null {
  if (raw.length > 50_000) return null;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const rows = record.items ?? record.products;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 100) return null;

  const items: ReceiptQrItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const entry = row as Record<string, unknown>;
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (typeof entry.quantity !== "number" && typeof entry.quantity !== "string") return null;
    const quantity = Number(entry.quantity);
    const unit = typeof entry.unit === "string" ? entry.unit.toUpperCase() : "PIECE";
    if (!name || name.length > 180 || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000 || !validUnits.has(unit)) return null;
    items.push({ name, quantity, unit: unit as InventoryUnit });
  }
  return items;
}
