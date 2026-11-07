import nodemailer, { Transporter } from "nodemailer";

export class MailServiceError extends Error {
  constructor(message: string, readonly code: "EMAIL_NOT_CONFIGURED" | "EMAIL_DELIVERY_FAILED") {
    super(message);
    this.name = "MailServiceError";
  }
}

export class MailService {
  private transporter?: Transporter;

  async sendOtpEmail(email: string, otpCode: string): Promise<void> {
    const transporter = this.getTransporter();
    const sender = process.env.EMAIL_FROM || `SmartKitchen App <${process.env.SMTP_USER}>`;
    try {
      const result = await transporter.sendMail({
        from: sender,
        to: email,
        subject: "Verify your SmartKitchen account",
        text: `Your SmartKitchen verification code is ${otpCode}. It expires in 5 minutes.`,
        html: this.renderOtpEmail(otpCode),
      });
      if (!result.accepted?.length) throw new Error("SMTP rejected the recipient");
    } catch (error) {
      console.error("[auth-service] OTP email delivery failed", error);
      throw new MailServiceError("Unable to send the verification email. Please try again later.", "EMAIL_DELIVERY_FAILED");
    }
  }

  async sendPasswordResetEmail(email: string, code: string): Promise<void> {
    const transporter = this.getTransporter();
    try {
      const result = await transporter.sendMail({
        from: process.env.EMAIL_FROM || `SmartKitchen App <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Đặt lại mật khẩu SmartKitchen",
        text: `Mã đặt lại mật khẩu SmartKitchen của bạn là ${code}. Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
      });
      if (!result.accepted?.length) throw new Error("SMTP rejected the recipient");
    } catch (error) {
      console.error("[auth-service] password reset email delivery failed", error);
      throw new MailServiceError("Unable to send the password reset email. Please try again later.", "EMAIL_DELIVERY_FAILED");
    }
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_PASS;
    if (!user || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new MailServiceError("Email delivery is not configured on the server.", "EMAIL_NOT_CONFIGURED");
    }
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: password },
      tls: { minVersion: "TLSv1.2" },
    });
    return this.transporter;
  }

  private renderOtpEmail(otpCode: string): string {
    return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f7f3;font-family:Arial,sans-serif;color:#17211f">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border:1px solid #e3e9e4;border-radius:16px">
          <tr><td style="padding:32px">
            <p style="margin:0 0 12px;color:#2f6b5f;font-size:12px;font-weight:bold;letter-spacing:1.5px">SMARTKITCHEN</p>
            <h1 style="margin:0 0 12px;font-size:24px">Verify your email</h1>
            <p style="margin:0;color:#68736f;font-size:15px;line-height:1.6">Enter this one-time code in the app to finish creating your account.</p>
            <p style="margin:24px 0;padding:16px;background:#f4f7f3;border-radius:12px;text-align:center;color:#2f6b5f;font-size:32px;font-weight:bold;letter-spacing:8px">${otpCode}</p>
            <p style="margin:0;color:#68736f;font-size:13px;line-height:1.6">This code expires in 5 minutes. If you did not request it, you can ignore this email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  }
}
