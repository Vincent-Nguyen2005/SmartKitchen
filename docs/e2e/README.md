# SmartKitchen E2E Scenarios

## Run

```bash
docker compose up -d --build
pnpm test:e2e-smoke
# PowerShell: ./scripts/test-e2e-smoke.ps1
```

Reset local data with `docker compose down -v` followed by `docker compose up -d --build`. Smoke requests use the gateway at `http://localhost:4000` with a dev access token signed from `JWT_SECRET`. The scripts take `JWT_SECRET` from the environment if it is set, otherwise from the root `.env` (only that key is read; the value is never printed). If neither has it, they stop with `FAIL JWT_SECRET is not set: … copy .env.example to .env and set JWT_SECRET` instead of signing with a placeholder. It must be the value the stack runs with, or every authenticated check returns 401. Admin catalog/weight assertions call admin-service directly on port `4011` with `x-user-id` / `x-user-role`, because the gateway strips client-supplied identity headers. Fixtures are in `docs/e2e/test-data/`.

Before the smoke run, apply the service migrations and admin seed: `pnpm --filter notification-service prisma:deploy`, `pnpm --filter admin-service prisma:deploy`, and `pnpm --filter admin-service prisma:seed`, with each service's `DATABASE_URL` set to its compose database.

A scenario passes when the expected HTTP status and response contract are observed without leaking credentials. Status values (`Verified`, `Ready`, `Blocked`) are defined at the top of `scenarios.md`; `Blocked` scenarios are reported as SKIP and do not fail the run. Gateway, notification and admin details: `docs/gateway.md`, `docs/notification-service.md`, `docs/admin-service.md`.

Naming convention: `E2E-<epic>-<number>` for scenarios and `<domain>-<purpose>.json` for fixtures.
