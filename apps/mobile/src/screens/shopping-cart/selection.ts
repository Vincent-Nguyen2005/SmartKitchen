/**
 * Đi chợ multi-select. Long press a card → selection mode with that card selected; in selection mode a tap toggles a
 * card (it never opens the quantity sheet). ✕, Android back, a tap on empty space, leaving the tab and a finished
 * "Thêm vào Giỏ hàng" all exit and clear the selection. Pure (no React Native), covered by selection.test.ts.
 */
import type { ShoppingUnit } from "./shoppingApi";

export type Selection = { active: boolean; ids: string[] };
export const NO_SELECTION: Selection = { active: false, ids: [] };

export type SelectionAction =
  | { type: "longPress"; id: string }
  | { type: "tap"; id: string }
  | { type: "exit" };

export function selectionReducer(state: Selection, action: SelectionAction): Selection {
  switch (action.type) {
    case "longPress":
      if (!state.active) return { active: true, ids: [action.id] };
      // Already selecting: a long press selects the card (never unselects by accident).
      return state.ids.includes(action.id) ? state : { active: true, ids: [...state.ids, action.id] };
    case "tap": {
      if (!state.active) return state;
      const ids = state.ids.includes(action.id) ? state.ids.filter((id) => id !== action.id) : [...state.ids, action.id];
      // Unselecting the last card keeps selection mode (the bar shows "Đã chọn 0"); ✕ or empty space leaves it.
      return { active: true, ids };
    }
    case "exit":
      return state.active || state.ids.length > 0 ? NO_SELECTION : state;
    default:
      return state;
  }
}

/** What a tap on a card does: toggle in selection mode, otherwise open the quantity sheet. */
export const tapIntent = (state: Selection): "toggle" | "open" => (state.active ? "toggle" : "open");

/**
 * Quantity added per product by "Thêm vào Giỏ hàng" from selection mode: 0,5 kg for products sold by the kg (a
 * sensible small amount, within the 0,1 kg steps), 1 for pieces, packs, bottles, cans, boxes (and any other unit).
 */
export const bulkAddQuantity = (unit: ShoppingUnit): number => (unit === "KILOGRAM" ? 0.5 : 1);
