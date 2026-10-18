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
