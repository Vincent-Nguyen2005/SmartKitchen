# Family Service

Owner: Kazan. Responsibility: household membership and family relationship APIs.

## Family settings and ownership

- `GET /api/family/settings` returns the authenticated member's family preferences.
- **Roles:** a family has one owner (`OWNER`, chủ gia đình) and members (`MEMBER`, thành viên). There are no family admins: setting or inviting with `ADMIN` answers 400, and a leftover `ADMIN` row is treated as `MEMBER` everywhere (permissions, `/me`, internal memberships). `scripts/data-fixes/2026-12-family-admin-to-member.js` cleans stored rows. (The platform admin role in auth-service is unrelated.)
- Owner only: invite, regenerate the join code, family QR, `PATCH /api/family/settings`, `PATCH /members/:id/role` (only `MEMBER`), remove a member, transfer ownership. Members get 403.
- `PATCH /api/family/settings` updates dietary restrictions, currency, monthly budget, and household rules.
- `POST /api/family/transfer-ownership` accepts `{ "memberId": "<family-member-id>" }`. Only the owner can transfer ownership; the former owner becomes a member.
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

## Admin family directory

These public endpoints enter admin-service via the gateway, require an authenticated `ADMIN` role, and use an `x-api-key: INTERNAL_API_KEY` request from admin-service to family-service. Family-service calls auth-service `POST /internal/admin/users/profiles` with the same key to resolve owner/member names and emails. The gateway blocks external `/internal/*` requests. `AUTH_SERVICE_URL` identifies the internal auth-service host.

- `GET /api/admin/families?page=1&limit=20&q=` → `{ "items": [{ "id": "uuid", "name": "Home", "memberCount": 2, "ownerEmail": "owner@example.com", "createdAt": "ISO date" }], "total": 1, "page": 1, "limit": 20 }`. `q` searches family names.
- `GET /api/admin/families/:id` → `{ "id": "uuid", "name": "Home", "memberCount": 2, "ownerEmail": "owner@example.com", "createdAt": "ISO date", "members": [{ "id": "membership uuid", "userId": "uuid", "name": "Name", "email": "member@example.com", "role": "OWNER" }] }`.

`limit` is 1–100. Invalid query/id returns 400, unknown family 404, invalid internal key 403, and unavailable auth-service or family database 503 `{ "error": "SERVICE_UNAVAILABLE", "message": "..." }`. Internal paths are `GET /internal/admin/families` and `GET /internal/admin/families/:id`; do not call them from a browser. Run tests with `pnpm --filter family-service test` or the CI coverage command `pnpm --filter family-service test:coverage`.

Gateway `/api/families/me` is forwarded as `/me`, so the family router is mounted at the service root as well as its direct-service legacy path `/api/family/me`.

## Internal routes: family members and memberships

`POST /internal/families/memberships` with `{ "userIds": [...] }` (1–500 UUIDs) returns `{ items: [{ userId, familyId, role, memberCount }] }`, only for the users who belong to a family. It contains no names. menu-service uses it to find the caller's family on each menu request, and its startup backfill uses it to map older menus to families. Wrong or missing key gives 403; invalid body 400.

`GET /internal/families/:id/members` returns `{ items: [{ userId, name }] }` in join order. It is for menu-service (family menus).

- `name` is the auth display name, resolved through auth-service `POST /internal/admin/users/profiles`. It is null when the user has none.
- It requires `x-api-key: INTERNAL_API_KEY`: wrong or missing key 403, key not configured 503, invalid id 400, unknown family 404, auth-service or database unavailable 503.
- The gateway blocks external `/internal/*` requests. Tests: `src/routes/internal-families.routes.test.ts` (included in `pnpm --filter family-service test`).
