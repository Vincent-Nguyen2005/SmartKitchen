/**
 * Which app shell a signed-in account sees (pure, covered by appShell.test.ts):
 * - admin: only Quản trị;
 * - shipper: only the shipper shell (Đơn chờ / Đang giao / Lịch sử): no Kho, Đi chợ, Nấu ăn, Gia đình, capture bar,
 *   onboarding or health wizard;
 * - user: the normal app.
 * The server enforces the roles; this only picks the screens.
 */
export type AppShell = "admin" | "shipper" | "user";
export const appShellFor = (role: string | null | undefined): AppShell => (role === "ADMIN" ? "admin" : role === "SHIPPER" ? "shipper" : "user");
/** The "Thông tin cơ bản" wizard after sign-in is for normal users only. */
export const showsOnboarding = (shell: AppShell, freshSignIn: boolean): boolean => freshSignIn && shell === "user";
