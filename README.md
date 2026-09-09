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