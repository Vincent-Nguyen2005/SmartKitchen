# Auth Service

Owner: Kazan. Responsibility: authentication, authorization, and account identity APIs.

## One-time admin seed

On the shared host, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the Git-ignored root `.env`, then start auth-service with `docker compose -f docker-compose.yml -f docker-compose.remote.yml up -d --build auth-service`. The service seeds a verified `ADMIN` account before listening, using the same bcrypt hash as password registration. If the email already exists, the seed leaves its role and password unchanged; missing variables skip the seed and log a warning. Never put the actual password in `.env.example`, Git, or service logs. Because an initial password shared in chat is exposed, rotate it after first login.

## Email verification

New password-based registrations remain inactive until the user verifies the 6-digit code emailed to them. Codes expire after 5 minutes, and resend requests have a 60-second cooldown.

Configure Gmail SMTP before running the service:

1. Copy `services/auth-service/.env.example` to `services/auth-service/.env`.
2. Set `SMTP_PASS` to a Gmail App Password. Do not use or commit your regular Gmail password.
3. For Docker Compose, set `SMTP_PASS` (and optionally the other `SMTP_*`/`EMAIL_FROM` values) in the repository-root `.env` file.

### Team registration checklist

Git does not include `.env` or SMTP App Passwords. Each developer running their **own backend** needs a root `.env` with `JWT_SECRET`, `INTERNAL_API_KEY`, `PURCHASE_SYNC_API_KEY`, `SMTP_USER`, and `SMTP_PASS`, plus a reachable database. Do not share an App Password in chat or commit it. `EMAIL_FROM` can be left empty; the service then sends from `SMTP_USER`. If mail delivery is not configured, registration returns `EMAIL_NOT_CONFIGURED` (503), not a working OTP.

For team testing **without real email credentials**, run this from the repository root after `pnpm install`:

```powershell
pnpm dev:team:backend
```

On a fresh clone, the command creates a Git-ignored root `.env` with unique random keys on **that machine**; it never overwrites an existing `.env`. It starts the local-only [Mailpit override](../../docker-compose.mailpit.yml), which captures registration and reset codes at `http://127.0.0.1:8025` on the backend computer. Search by the address used during registration. These messages **do not reach Gmail or other real inboxes**. This mode is for development only. The Mailpit UI binds to loopback; never expose it publicly or use it for production verification. When using the normal Compose file without this override, valid SMTP credentials are still required.

Start the app with `pnpm --filter mobile exec expo start --web --port 8081`. The web app at `http://localhost:8081` calls the local gateway at port 4000. On a physical phone, set `EXPO_PUBLIC_API_BASE_URL=http://<backend-LAN-IP>:4000` in a Git-ignored `apps/mobile/.env.local` before starting Expo; `localhost` on the phone points to the phone, not the backend computer. Each developer's local Compose stack uses its own database, so accounts do not automatically appear on other machines.

To use **one shared backend/database** instead, run the gateway and auth-service on a machine/server with SMTP configured, and point each teammate's mobile app at that gateway using `EXPO_PUBLIC_API_BASE_URL` (physical device: reachable LAN IP or HTTPS host, not `localhost`). All team members then register against the same database. The web development build on port 8081 uses its browser host on port 4000. Check `GET /health` on the gateway and auth-service before testing registration.

For OTP to arrive in each member's **real email inbox**, use that shared backend with an SMTP account configured privately on the server (or configure SMTP privately on each developer's machine). `EMAIL_FROM` is the sender; the recipient is always the email entered at registration. Do not put App Passwords, JWT secrets, or internal API keys in Git, even in a private repository: history, forks, and CI logs can preserve them. Rotate any credential already shared in chat or committed previously.

An unverified address can register again with updated information after a failed delivery; if a code was sent within the last 60 seconds, the existing code remains valid and no duplicate email is sent. Registration returns `otpSent` and `retryAfterSeconds` so the app does not claim a new message was sent during cooldown. Use `POST /api/auth/resend-otp` after the cooldown. A verified address returns 409 and must sign in or use password reset. The OTP email goes to the **registration email**, not the SMTP sender address; check the exact spelling and Spam folder.

### Password reset

`POST /api/auth/password-reset/request` accepts `{ "email": "member@example.com" }` and returns the same generic 202 for unknown addresses and successfully processed verified accounts to avoid account enumeration (SMTP/database failures return 503). Verified accounts receive an 8-digit code at their registered email. The code expires in 10 minutes; repeat requests within 60 seconds do not send another email. `POST /api/auth/password-reset/confirm` accepts `{ "email": "member@example.com", "code": "12345678", "newPassword": "NewPassword123" }`. After five wrong attempts the code is unusable; a successful reset changes the password, consumes the code, and revokes stored sessions/refresh tokens. Previously issued access tokens may remain valid until their 15-minute expiry. Never log or return the code in an API response.

The mobile flow calls `POST /api/auth/password-reset/verify` with `{ "email": "member@example.com", "code": "12345678" }` first. Only a valid unexpired code opens the new-password screen. The final confirm endpoint validates the code again before changing the password; the verify call alone never changes it. Wrong verification codes share the five-attempt limit.

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

## Shipper accounts (internal)

Created and managed by admins through admin-service (`/api/admin/shippers`, ADMIN role, audit-logged without passwords), which calls these internal endpoints (`x-api-key: INTERNAL_API_KEY`):
- `GET /internal/admin/shippers?q=`: `{ items: [{ id, name, phone, email, active, createdAt }] }`.
- `POST /internal/admin/shippers` `{ name, phone (Vietnamese), email, password }`: role SHIPPER, verified (no OTP), no family. Same password rule as sign-up (at least 8 characters with upper, lower and a digit), hashed with bcrypt. 409 when the email exists. The password is never returned or logged.
- `PATCH /internal/admin/shippers/:id/status` `{ active }`: disabling sets `disabledAt` and removes the account's refresh tokens and sessions. A disabled account gets 403 `ACCOUNT_DISABLED` on login, refresh and Google sign-in.
- `POST /internal/admin/shippers/:id/password` `{ password }`: the admin types a new password; current sessions end.
- `GET /internal/shippers/:id/status`: `{ active, role }`, used by shopping-list-service on every shipper call (cached 30 s).

`POST /internal/admin/users/profiles` also returns `phone` (customers see their shipper's phone once the order is on its way).

## Admin user directory

`GET /api/admin/users?page=1&limit=20&q=&role=` enters admin-service through the gateway. The gateway authenticates the bearer token and stamps `x-user-role: ADMIN`; admin-service forwards the request to this service at `GET /internal/admin/users` with `x-api-key: INTERNAL_API_KEY`. The internal route is not exposed by the gateway. `role` accepts `USER` or `ADMIN`; `limit` is 1–100.

Success: `{ "items": [{ "id": "uuid", "email": "a@example.com", "name": "Name", "role": "USER", "emailVerified": true, "createdAt": "ISO date" }], "total": 1, "page": 1, "limit": 20 }`. Password hashes and tokens are never selected. Invalid query returns 400, invalid internal key 403, and database outage 503 `{ "error": "SERVICE_UNAVAILABLE", "message": "Auth database is unavailable" }`.

For internal family-service lookups only, `POST /internal/admin/users/profiles` accepts `{ "ids": ["uuid"] }` with the same key and returns only `{ "items": [{ "id": "uuid", "email": "a@example.com", "name": "Name" }] }`.

Run route and service tests with `pnpm --filter auth-service test`; the CI coverage command is `pnpm --filter auth-service test:coverage`.
