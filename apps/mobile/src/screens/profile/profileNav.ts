/**
 * Hồ sơ sheet navigation (pure; covered by profileNav.test.ts). A sub-screen ("Thông tin sức khỏe") opens ON TOP of
 * the sheet, which stays open underneath (same state, same scroll position). Closing the sub-screen (✕ / "Quay lại" /
 * Android back) returns to the sheet; only closing the sheet itself closes everything.
 */
export type ProfileSubScreen = "health";
export type ProfileNav = { sheetOpen: boolean; sub: ProfileSubScreen | null };

export const PROFILE_CLOSED: ProfileNav = { sheetOpen: false, sub: null };

/** Tapping a row of the sheet: the sub-screen opens over the (still open) sheet. */
export const openProfileSub = (nav: ProfileNav, sub: ProfileSubScreen): ProfileNav => ({ sheetOpen: nav.sheetOpen, sub });

/** ✕ / "Quay lại" on a sub-screen: back to the sheet as it was. */
export const closeProfileSub = (nav: ProfileNav): ProfileNav => ({ sheetOpen: nav.sheetOpen, sub: null });

/** Android back: the sub-screen first, then the sheet. */
export const profileBack = (nav: ProfileNav): ProfileNav => (nav.sub ? closeProfileSub(nav) : PROFILE_CLOSED);
