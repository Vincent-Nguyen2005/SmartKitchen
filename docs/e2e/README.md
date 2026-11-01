# SmartKitchen E2E Scenarios

## Run

```bash
docker compose up -d --build
pnpm test:e2e-smoke
# PowerShell: ./scripts/test-e2e-smoke.ps1
```

Reset local data with `docker compose down -v` followed by `docker compose up -d --build`. Smoke requests use the gateway at `http://localhost:4000`; admin assertions use port `4011` because the gateway strips trusted admin headers. Fixtures are in `docs/e2e/test-data/`.

Before the smoke run, apply the service migrations and admin seed: `pnpm --filter notification-service prisma:deploy`, `pnpm --filter admin-service prisma:deploy`, and `pnpm --filter admin-service prisma:seed`, with each service's `DATABASE_URL` set to its compose database.

A scenario passes when the expected HTTP status and response contract are observed without leaking credentials. `Ready` means it is safe for the current Sprint 3 smoke run; `Blocked` scenarios are reported as SKIP and do not fail the run.

Naming convention: `E2E-<epic>-<number>` for scenarios and `<domain>-<purpose>.json` for fixtures.
