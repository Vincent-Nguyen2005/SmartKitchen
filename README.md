# SmartKitchen

SmartKitchen is a pnpm workspace containing an Express/TypeScript API gateway, eleven isolated backend services, and the mobile application scaffold. Each backend service owns a dedicated PostgreSQL container.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop with Compose

Install dependencies from the repository root:

```bash
pnpm install
```

### Test registration with the team

For a fresh clone, run `pnpm dev:team:backend`. It creates local, Git-ignored keys and starts the gateway, auth database, auth-service, and Mailpit. Run `pnpm --filter mobile exec expo start --web --port 8081` for the app. Registration OTP appears at `http://127.0.0.1:8025` on the backend computer, **not in the recipient's real email inbox**. Each computer has a separate database. For real-inbox delivery and shared accounts, run one reachable backend with privately configured SMTP and point team apps to that gateway. See [auth-service setup](services/auth-service/README.md#team-registration-checklist).

### Shared backend for real-email OTP (team testing)

Use **one** backend and database on the host computer; each teammate runs only the Expo app against the same gateway URL. The host keeps SMTP credentials in its ignored root `.env` (never in Git or a chat message). Start the host with `docker compose -f docker-compose.yml -f docker-compose.remote.yml up -d --build auth-service family-service gateway`. This overlay removes published database and service ports and binds the gateway to `127.0.0.1:4000`. Check `http://127.0.0.1:4000/health`, then expose **only the gateway** through a tunnel. The tunnel and host Docker containers must remain running while teammates test.

Each teammate puts the current tunnel URL in their ignored `apps/mobile/.env.local` as `EXPO_PUBLIC_API_BASE_URL=https://<gateway-tunnel-url>`, then restarts Expo with `pnpm --filter mobile exec expo start --web --clear --port 8081`. A restarted Quick Tunnel gets a new URL, so the host must share the new URL and everyone must update their local file. After pulling changes, run `pnpm install`. For prerequisites, tunnel setup, CORS, SMTP troubleshooting, and security limits, follow the [shared-host guide](docs/deploy/shared-host.md). This is for internal testing, not production hosting.

For the normal Compose mode, create the root `.env` **before** the first `docker compose up` (compose refuses to start without `JWT_SECRET`). The team-test command above creates this file automatically on a fresh clone. `.env` is git-ignored; never commit it.

```powershell
Copy-Item .env.example .env          # bash: cp .env.example .env
# Generate a 64-character hex secret and paste it as JWT_SECRET in .env:
-join (1..64 | % { [char]((48..57)+(97..102) | Get-Random) })
# bash: openssl rand -hex 32
```

Full documentation (architecture, gateway, notification and admin services, troubleshooting, runbook): [docs/README.md](docs/README.md).

## Functional Verification Steps

1. Run the local type check and build:

   ```bash
   pnpm build
   ```

2. Start the complete Docker environment:

   ```bash
   docker compose up -d --build
   ```

3. Run the automated health test:

   ```bash
   pnpm test:health
   # Git Bash, WSL, macOS, or Linux:
   ./scripts/test-health.sh
   # Windows PowerShell:
   .\scripts\test-health.ps1
   ```

4. Verify an individual PostgreSQL container. Repeat with each service database listed in `docker-compose.yml`:

   ```bash
   docker exec -it smartkitchen-auth-db psql -U postgres -d auth_db -c "SELECT 1;"
   ```

The health script checks ports 4000 through 4011 and exits non-zero unless all twelve endpoints return HTTP 200 with `status: "OK"`.

## Development

```bash
pnpm dev
pnpm lint
```

Use each service's `.env.example` as the starting point for local, non-Docker development. Ownership and review routing are documented in `.github/CODEOWNERS`.

## CI Pipeline

`.github/workflows/ci.yml` runs on pull requests targeting `main` or `develop` and on pushes to `main`. A matrix checks the gateway and all eleven services independently: frozen pnpm install, Prisma generation when available, lint, and build. The required aggregate check is `CI / ci-success`.

Run the same checks locally with:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm build
```

Build a Prisma service with `pnpm turbo run build --filter=<service>` to generate its client automatically. If running `pnpm --filter <service> build` directly, run `pnpm --filter <service> prisma:generate` first.

Each Prisma service must set a separate `output` in its generator and import the client from that path, because pnpm shares one `@prisma/client` package between services using the same version.

### Prisma Schema Ownership

When adding Prisma models to a service, the owner must (a) add the `prisma:*` scripts and `prisma`/`@prisma/client` dev dependencies, and (b) fill in `prisma_schema` for that service in the `ci.yml` matrix.

To enable branch protection, require the `CI / ci-success` status check and require at least one CODEOWNER approval in the repository branch protection settings.

## Gateway Routing

| Gateway prefix | Service |
| --- | --- |
| `/api/auth` | auth-service |
| `/api/families` | family-service |
| `/api/inventory` | inventory-service |
| `/api/nutrition` | nutrition-service |
| `/api/meal-diary` | meal-diary-service |
| `/api/recipes` | recipe-service |
| `/api/menus` | menu-service |
| `/api/shopping-list` | shopping-list-service |
| `/api/payments` | payment-service |
| `/api/notifications` | notification-service |
| `/api/admin` | admin-service |

The gateway strips the `/api/<prefix>` segment before forwarding. Therefore `/api/notifications/health` becomes `/health` at the Notification Service.

After starting Docker, verify routing on Windows with `pnpm test:routing` or `./scripts/test-routing.ps1`, and use `./scripts/test-routing.sh` on Bash-compatible systems.

## Sprint 2 Database Verification

Apply the new schemas with:

```bash
pnpm --filter notification-service prisma:deploy
pnpm --filter admin-service prisma:deploy
```

List the expected tables:

```bash
docker exec -it smartkitchen-notification-db-1 psql -U postgres -d notification_db -c "\\dt"
docker exec -it smartkitchen-admin-db-1 psql -U postgres -d admin_db -c "\\dt"
curl http://localhost:4000/api/notifications/health
```

Notification tables are `notifications`, `device_tokens`, `notification_preferences`, `partner_supermarkets`, and `promotions`. Admin tables are `master_ingredients`, `recommendation_weights`, `recommendation_weight_history`, `service_health_logs`, `account_reports`, and `audit_logs`.

## Gateway: Rate Limiting & Caching

The gateway limits `/api/*` by IP, protects `/api/auth` with a stricter limit, and returns JSON `429` responses with `RateLimit-*` headers. Public `GET /api/recipes/health` and `GET /api/notifications/promotions` use an in-memory cache with `x-cache: HIT`, `MISS`, or `BYPASS`. Configure behavior with the gateway `.env.example` variables; client identity headers are stripped before proxying.

## Notification Service: Promotions

Promotion ingestion, keyword matching, preferences, device tokens, mock/Expo dispatch, quiet hours, and scheduled dispatch are available on port 4010. Set `PARTNER_API_KEY`, `PUSH_PROVIDER`, `ENABLE_JOBS`, `PROMOTION_CRON`, and `DEFAULT_TIMEZONE` before enabling partner traffic.

## Admin Service: Ingredients & Weights

Port 4011 provides admin-protected ingredient CRUD/import/export and recommendation weights with audit logs, history, reset defaults, and optimistic locking. Run `pnpm --filter admin-service prisma:seed` after applying migrations. Values are validated between 0 and 1 and are not normalized.

## E2E Testing

Run the preparation smoke suite with `pnpm test:e2e-smoke` or `./scripts/test-e2e-smoke.ps1`. The scenario matrix and fixtures are in `docs/e2e/`; blocked workflows are printed as `SKIP` and do not fail the smoke run.
