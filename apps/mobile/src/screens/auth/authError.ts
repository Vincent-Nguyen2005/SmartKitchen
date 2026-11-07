import { ApiError } from "../../services/api";

export function authErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  switch (error.code) {
    case "NETWORK_ERROR": return "Không kết nối được máy chủ. Vui lòng kiểm tra mạng và địa chỉ API.";
    case "INVALID_CREDENTIALS": return "Email hoặc mật khẩu không đúng.";
    case "EMAIL_NOT_VERIFIED": return "Tài khoản chưa xác minh. Vui lòng nhập mã trong email.";
    case "EMAIL_ALREADY_REGISTERED": return "Email này đã có tài khoản. Vui lòng đăng nhập.";
    case "INVALID_OTP": return "Mã xác minh không đúng.";
    case "OTP_EXPIRED": return "Mã xác minh đã hết hạn. Vui lòng gửi lại mã.";
    case "OTP_RESEND_COOLDOWN": return "Vui lòng đợi trước khi gửi lại mã.";
    case "EMAIL_NOT_CONFIGURED": return "Máy chủ này chưa cấu hình gửi email. Nhóm phát triển có thể bật Mailpit để thử nghiệm, hoặc cấu hình SMTP để nhận mã trong hộp thư thật.";
    case "EMAIL_DELIVERY_FAILED": return "Không gửi được email xác minh. Vui lòng thử lại.";
    case "ACCOUNT_ALREADY_VERIFIED": return "Tài khoản đã xác minh. Vui lòng đăng nhập.";
    case "ACCOUNT_NOT_FOUND": return "Không tìm thấy tài khoản với email này.";
    case "INVALID_RESET_CODE": return "Mã đặt lại mật khẩu không đúng, đã hết hạn hoặc đã thử quá nhiều lần.";
  }
  if (error.status === 429) return "Bạn thao tác quá nhanh. Vui lòng thử lại sau.";
  if (error.status >= 500) return "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.";
  return fallback;
}
