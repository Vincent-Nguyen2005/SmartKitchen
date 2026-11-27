/**
 * Thông báo selection mode publishes its bar here; App.tsx renders "✕ · N đã chọn · Xóa" at the bottom (the same
 * one-line bar as Đi chợ, shopping-cart/selectionBar.ts). `canAdd` means "Xóa" is enabled (something selected, not busy).
 * Kept free of React Native imports.
 */
import { useSyncExternalStore } from "react";
import { createSelectionBarStore, type SelectionBarState } from "../shopping-cart/selectionBar";

export const notificationSelectionBar = createSelectionBarStore();

export function useNotificationSelectionBar(): SelectionBarState {
  return useSyncExternalStore(notificationSelectionBar.subscribe, notificationSelectionBar.get, notificationSelectionBar.get);
}
