# Auth Service

Owner: Kazan. Responsibility: authentication, authorization, and account identity APIs.

## Email verification

New password-based registrations remain inactive until the user verifies the 6-digit code emailed to them. Codes expire after 5 minutes, and resend requests have a 60-second cooldown.

Configure Gmail SMTP before running the service:

1. Copy `services/auth-service/.env.example` to `services/auth-service/.env`.
2. Set `SMTP_PASS` to a Gmail App Password. Do not use or commit your regular Gmail password.
3. For Docker Compose, set `SMTP_PASS` (and optionally the other `SMTP_*`/`EMAIL_FROM` values) in the repository-root `.env` file.

If SMTP fails with `self-signed certificate in certificate chain` on a machine where antivirus or a proxy inspects mail traffic, do **not** disable TLS verification. Confirm the certificate issuer and fingerprint against a CA already trusted by that machine. Export that CA as a PEM (Base-64 X.509) file outside Git, set `SMTP_CA_CERT_PATH` in the root `.env` to its absolute path, then start auth-service with the optional [SMTP CA Compose override](../../docker-compose.smtp-ca.example.yml):

```powershell
docker compose -f docker-compose.yml -f docker-compose.smtp-ca.example.yml up -d --no-deps --force-recreate auth-service
```

The override supplies the CA through `NODE_EXTRA_CA_CERTS`; it does not bypass certificate validation. The CA file, SMTP credentials, and any machine-specific `docker-compose.override.yml` must stay local. If registration succeeded before SMTP was fixed but no code arrived, request a new code with `POST /api/auth/resend-otp` (subject: `Verify your SmartKitchen account`); the earlier code may already have expired. A 200 response means the mail provider accepted the send, not that it reached Inbox, so also check Spam.

The OTP migration is in `prisma/migrations/20261104000000_add_email_otp`. Apply pending migrations with:

```powershell
pnpm --filter auth-service exec prisma migrate deploy
```

For local development, the equivalent is `pnpm --filter auth-service exec prisma migrate dev`.

The registration endpoint returns a pending-verification response without issuing tokens. Submit `{ "email": "...", "otpCode": "123456" }` to `POST /api/auth/verify-otp`; successful verification issues the regular access and refresh tokens. `POST /api/auth/resend-otp` accepts `{ "email": "..." }`.

## Admin user directory

`GET /api/admin/users?page=1&limit=20&q=&role=` enters admin-service through the gateway. The gateway authenticates the bearer token and stamps `x-user-role: ADMIN`; admin-service forwards the request to this service at `GET /internal/admin/users` with `x-api-key: INTERNAL_API_KEY`. The internal route is not exposed by the gateway. `role` accepts `USER` or `ADMIN`; `limit` is 1–100.

Success: `{ "items": [{ "id": "uuid", "email": "a@example.com", "name": "Name", "role": "USER", "emailVerified": true, "createdAt": "ISO date" }], "total": 1, "page": 1, "limit": 20 }`. Password hashes and tokens are never selected. Invalid query returns 400, invalid internal key 403, and database outage 503 `{ "error": "SERVICE_UNAVAILABLE", "message": "Auth database is unavailable" }`.

For internal family-service lookups only, `POST /internal/admin/users/profiles` accepts `{ "ids": ["uuid"] }` with the same key and returns only `{ "items": [{ "id": "uuid", "email": "a@example.com", "name": "Name" }] }`.

Run route and service tests with `pnpm --filter auth-service test`; the CI coverage command is `pnpm --filter auth-service test:coverage`.
