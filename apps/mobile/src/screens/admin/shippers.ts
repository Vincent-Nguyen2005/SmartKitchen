/**
 * Quản trị › Người giao hàng: types and form checks (pure, covered by shippers.test.ts). The server checks the same
 * rules (auth-service); passwords are typed by the admin, sent once and never shown back.
 */
export type ShipperAccount = { id: string; name: string | null; phone: string | null; email: string; active: boolean; createdAt: string; deliveredCount: number | null };
export type NewShipper = { name: string; phone: string; email: string; password: string };

const VN_PHONE = /^(?:\+84|84|0)(?:3|5|7|8|9|2\d)\d{8}$/;
export const passwordProblem = (password: string): string | null => {
  if (password.length < 8) return "Mật khẩu tối thiểu 8 ký tự";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return "Mật khẩu cần có chữ hoa, chữ thường và số";
  return null;
};
export const newShipperProblem = (input: NewShipper): string | null => {
  if (!input.name.trim()) return "Nhập tên";
  if (!VN_PHONE.test(input.phone.replace(/[\s.-]/g, ""))) return "Số điện thoại không hợp lệ";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return "Email không hợp lệ";
  return passwordProblem(input.password);
};
/** "12/11/2026" (Vietnam day). */
export const vnDate = (iso: string): string => {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "—";
  const day = new Date(time + 7 * 3_600_000).toISOString();
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
};

export const statusText = (account: Pick<ShipperAccount, "active">): string => (account.active ? "Đang hoạt động" : "Đã khóa");

/** The detail sheet: name, phone, email, status, delivered count, created date. */
export const shipperDetailRows = (account: ShipperAccount): Array<{ label: string; value: string }> => [
  { label: "Họ tên", value: account.name ?? "Chưa có tên" },
  { label: "Số điện thoại", value: account.phone ?? "—" },
  { label: "Email", value: account.email },
  { label: "Trạng thái", value: statusText(account) },
  { label: "Đã giao", value: deliveredText(account.deliveredCount) },
  { label: "Ngày tạo", value: vnDate(account.createdAt) },
];

/** The detail sheet's actions: "Đặt lại mật khẩu" and "Khóa" (active) / "Mở khóa" (locked). */
export const shipperActions = (account: Pick<ShipperAccount, "active">): Array<{ key: "reset" | "toggle"; label: string; destructive: boolean }> => [
  { key: "reset", label: "Đặt lại mật khẩu", destructive: false },
  { key: "toggle", label: account.active ? "Khóa" : "Mở khóa", destructive: account.active },
];

/** The lock / unlock confirm (unchanged texts). */
export const toggleConfirm = (account: Pick<ShipperAccount, "active" | "name" | "email">) => account.active
  ? { title: `Khóa tài khoản ${account.name ?? account.email}?`, message: "Người này sẽ không đăng nhập được nữa. Đơn họ đang giao sẽ quay lại danh sách chờ cho người khác nhận.", confirmLabel: "Khóa", destructive: true }
  : { title: `Mở khóa ${account.name ?? account.email}?`, message: "Người này sẽ đăng nhập và nhận đơn được trở lại.", confirmLabel: "Mở khóa" };

/** "12 đơn đã giao"; "—" when the count is unavailable. */
export const deliveredText = (count: number | null): string => (count === null ? "—" : `${count} đơn đã giao`);
