/**
 * Kho item sheet: form values → the update to save (pure, covered by itemForm.test.ts). Invalid values throw a
 * FieldError naming the field, so the sheet shows the message at that field and keeps the input.
 */
import { FieldError } from "../../services/autoSave";
import type { InventoryLocation, InventoryUnit, UpdateFoodItem } from "./inventoryApi";
import { choiceFor } from "./unitChoices";

export type ItemFields = { name: string; quantity: string; unit: string; location: InventoryLocation; expiry: string };
export type ItemField = "name" | "quantity" | "expiry";

/** Bought (locked) items: only the storage place changes. */
export const lockedPatch = (fields: ItemFields): UpdateFoodItem => ({ storageLocation: fields.location });

/** Manual items: every field, validated like before (DD/MM/YYYY expiry, empty = none). */
export function manualPatch(fields: ItemFields, currentUnit: string): UpdateFoodItem {
  if (!fields.name.trim()) throw new FieldError("Tên nguyên liệu không được để trống.", "name");
  const quantity = Number(fields.quantity.replace(",", "."));
  if (!fields.quantity.trim() || !Number.isFinite(quantity) || quantity < 0) throw new FieldError("Số lượng phải là số không âm.", "quantity");
  let expiryDate: string | null = null;
  if (fields.expiry.trim()) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fields.expiry.trim());
    if (!match) throw new FieldError("Hạn dùng cần có dạng DD/MM/YYYY.", "expiry");
    const [, day, month, year] = match;
    const iso = `${year}-${month}-${day}`;
    const date = new Date(`${iso}T12:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) throw new FieldError("Ngày hạn dùng không hợp lệ.", "expiry");
    expiryDate = `${iso}T00:00:00.000Z`;
  }
  const choice = choiceFor(fields.unit);
  return {
    name: fields.name.trim(),
    quantity,
    unit: (choice?.unit ?? currentUnit) as InventoryUnit,
    unitLabel: choice?.unitLabel ?? null,
    storageLocation: fields.location,
    expiryDate,
  };
}
