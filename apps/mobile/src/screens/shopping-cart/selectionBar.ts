/**
 * The Đi chợ selection bar lives where the capture bar is (App.tsx), so Đi chợ publishes its selection here and App
 * renders the bar instead of "Chụp ảnh / QR gia đình / Giọng nói". Kept free of React Native imports (unit tests).
 */
import { useSyncExternalStore } from "react";

export type SelectionBarState = {
  active: boolean;
  count: number;
  /** "Thêm vào giỏ" is running. */
  busy: boolean;
  /** The add button is disabled (no family, nothing selected, or busy). */
  canAdd: boolean;
};

export const IDLE_BAR: SelectionBarState = { active: false, count: 0, busy: false, canAdd: false };

type Handlers = { onExit: () => void; onAdd: () => void };

export type SelectionBarStore = {
  get: () => SelectionBarState;
  subscribe: (listener: () => void) => () => void;
  /** Đi chợ: the current selection and what ✕ / "Thêm vào giỏ" do. */
  publish: (state: SelectionBarState, handlers: Handlers) => void;
  /** Đi chợ left (unmounted) or selection ended: the capture bar comes back. */
  clear: () => void;
  exit: () => void;
  add: () => void;
};

export function createSelectionBarStore(): SelectionBarStore {
  let state = IDLE_BAR;
  let handlers: Handlers | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const same = (next: SelectionBarState) =>
    next.active === state.active && next.count === state.count && next.busy === state.busy && next.canAdd === state.canAdd;
  return {
    get: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    publish: (next, nextHandlers) => {
      handlers = nextHandlers;
      if (same(next)) return;
      state = next;
      emit();
    },
    clear: () => {
      handlers = null;
      if (state === IDLE_BAR) return;
      state = IDLE_BAR;
      emit();
    },
    exit: () => handlers?.onExit(),
    add: () => { if (state.canAdd) handlers?.onAdd(); },
  };
}

/** The one store shared by Đi chợ (MarketProducts) and App's bottom bar. */
export const marketSelectionBar = createSelectionBarStore();

export function useMarketSelectionBar(): SelectionBarState {
  return useSyncExternalStore(marketSelectionBar.subscribe, marketSelectionBar.get, marketSelectionBar.get);
}

/** "3 đã chọn" (one line in the bar). */
export const selectedCountText = (count: number): string => `${count} đã chọn`;
