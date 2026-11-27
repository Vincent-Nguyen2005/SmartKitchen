/**
 * One-shot device position: the decision (pure, covered by locationState.test.ts).
 * - Device location off → "services-off": nothing is requested (no system dialog); the screen shows our own banner,
 *   and only a tap on it asks the system once to turn location on.
 * - Permission denied → "denied": the map still works with the customer's pin and the address.
 * - Otherwise → "granted": one position at Balanced accuracy, never the Android "improve accuracy" dialog.
 */
export type LocationStatus = "services-off" | "denied" | "granted";
export const locationStatus = (input: { servicesEnabled: boolean; permissionGranted: boolean | null }): LocationStatus =>
  !input.servicesEnabled ? "services-off" : input.permissionGranted ? "granted" : "denied";
/** Ask for the permission only when location is on (so a dialog never stacks on the "location off" state). */
export const shouldRequestPermission = (servicesEnabled: boolean): boolean => servicesEnabled;

export const LOCATION_OFF_TEXT = "Định vị đang tắt — bật định vị để xem vị trí của bạn";
export const LOCATION_DENIED_TEXT = "Chưa được cấp quyền vị trí.";
/** Position options for every one-shot request: Balanced, and no Android settings dialog on its own. */
export const ONE_SHOT_OPTIONS = { accuracy: "balanced", mayShowUserSettingsDialog: false } as const;
