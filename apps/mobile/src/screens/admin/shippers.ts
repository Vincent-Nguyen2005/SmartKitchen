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
/** "12 đơn đã giao"; "—" when the count is unavailable. */
export const deliveredText = (count: number | null): string => (count === null ? "—" : `${count} đơn đã giao`);
