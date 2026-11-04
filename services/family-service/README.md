# Family Service

Owner: Kazan. Responsibility: household membership and family relationship APIs.

## Family settings and ownership

- `GET /api/family/settings` returns the authenticated member's family preferences.
- `PATCH /api/family/settings` updates dietary restrictions, currency, monthly budget, and household rules. Only owners and admins can update settings.
- `POST /api/family/transfer-ownership` accepts `{ "memberId": "<family-member-id>" }`. Only the owner can transfer ownership; the former owner becomes an admin.
- Owners must transfer ownership before leaving or being removed.
- Family API responses use `{ "success": boolean, "data"?: object, "error"?: string }`.

## Migration and verification

Set `DATABASE_URL` for the family database, then apply committed migrations:

```powershell
pnpm --filter family-service exec prisma migrate deploy
pnpm --filter family-service build
```

For the local Docker Compose database, the default family database is exposed at port `5402`. Once Compose is running, apply the migration with:

```powershell
docker compose exec family-service npx --no-install prisma migrate deploy
```

Build and start the assigned services, then check both health endpoints:

```powershell
docker compose up -d --build auth-service family-service
Invoke-RestMethod http://localhost:4001/health
Invoke-RestMethod http://localhost:4002/health
```