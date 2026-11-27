# Auth and Family (SCRUM-280–282)

Auth and Family are separate services with separate PostgreSQL databases and Prisma clients (`client-auth` and `client-family`, both Prisma 5.22.0). The mobile app calls only the gateway: `/api/auth/*` and `/api/families/*`. Do not point the app at port 4001 or 4002. On web, session storage uses `localStorage`; on native devices it uses Expo SecureStore. An access token expires after 15 minutes; the refresh flow renews it, and the app retries restoration after a transient network outage instead of silently logging out.

## User journey

1. `POST /api/auth/register` creates an unverified account and emails a six-digit OTP to the submitted address. No token is issued yet. An unverified address can retry registration; an already verified address cannot be re-registered.
2. `POST /api/auth/verify-otp` verifies the code and issues access/refresh tokens. `POST /api/auth/resend-otp` respects a 60-second cooldown.
3. `POST /api/auth/login` issues the same tokens for a verified account. `POST /api/auth/refresh` rotates the refresh token; `GET /api/auth/me` retrieves the account; `POST /api/auth/logout` revokes the stored refresh token and session. Already issued access tokens can remain valid until expiry.
4. Password reset is three steps: `/api/auth/password-reset/request`, `/verify`, then `/confirm`. A successful verify call only unlocks the new-password form; confirm validates the code again and revokes sessions.
5. With a valid bearer token, the app uses `GET /api/families/me`, `POST /api/families/` and `POST /api/families/join` to view, create or join a family. Owners and family admins can update settings and manage members; only an owner can transfer ownership. Owners must transfer before leaving.

The auth-service can seed a verified `ADMIN` account at startup when both `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set **only in the host's ignored `.env`**. Existing accounts are never overwritten or promoted. The account password must not be placed in Git; rotate any password previously shared in chat. See [auth-service](../services/auth-service/README.md) and [family-service](../services/family-service/README.md) for endpoint details and migrations.

## Operations and checks

Run `pnpm --filter auth-service test` and `pnpm --filter family-service test`; both run in CI. For type checks, run `pnpm --filter auth-service lint`, `pnpm --filter family-service lint`, and `pnpm --filter mobile typecheck` after `pnpm install --frozen-lockfile`. To test against a shared host, use the [remote Compose overlay](../docker-compose.remote.yml) so that database and service ports are not published and only the gateway binds `127.0.0.1:4000`. Configure real SMTP on the host privately; the [shared-host guide](deploy/shared-host.md) covers tunnel URL and CORS setup.

`GET /api/admin/users`, `GET /api/admin/families`, and `GET /api/admin/families/:id` require an authenticated `ADMIN` role. The gateway forwards them to admin-service; calls between admin-service, auth-service and family-service use internal routes and `x-api-key: INTERNAL_API_KEY`. The gateway blocks external `/internal/*` paths. See [admin-service](admin-service.md) for the public API formats. Upstream or database outages return `503 SERVICE_UNAVAILABLE` from Auth/Family; do not expose password hashes, OTPs or tokens in directory responses. Family responses from admin-service carry only `id`, `name`, `memberCount` and `createdAt`: the owner email and member list returned by family-service are dropped, so no member data reaches the admin app (`GET /api/admin/users` keeps emails).
