# Auth Service

Owner: Kazan. Responsibility: authentication, authorization, and account identity APIs.

## Email verification

New password-based registrations remain inactive until the user verifies the 6-digit code emailed to them. Codes expire after 5 minutes, and resend requests have a 60-second cooldown.

Configure Gmail SMTP before running the service:

1. Copy `services/auth-service/.env.example` to `services/auth-service/.env`.
2. Set `SMTP_PASS` to a Gmail App Password. Do not use or commit your regular Gmail password.
3. For Docker Compose, set `SMTP_PASS` (and optionally the other `SMTP_*`/`EMAIL_FROM` values) in the repository-root `.env` file.

The OTP migration is in `prisma/migrations/20261104000000_add_email_otp`. Apply pending migrations with:

```powershell
pnpm --filter auth-service exec prisma migrate deploy
```

For local development, the equivalent is `pnpm --filter auth-service exec prisma migrate dev`.

The registration endpoint returns a pending-verification response without issuing tokens. Submit `{ "email": "...", "otpCode": "123456" }` to `POST /api/auth/verify-otp`; successful verification issues the regular access and refresh tokens. `POST /api/auth/resend-otp` accepts `{ "email": "..." }`.