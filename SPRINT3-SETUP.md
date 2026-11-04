# Sprint 3 setup

## Database migrations

The auth and family services now include Prisma migration baselines. On a fresh database, migrations are applied automatically by the Docker containers before the services start. For local databases, from the repository root run:

```powershell
pnpm --filter auth-service exec prisma migrate deploy
pnpm --filter family-service exec prisma migrate deploy
```

The family join-code expiry migration adds a seven-day expiry to existing family codes. Invitation tokens expire after seven days. If a database was previously initialized with `prisma db push` and has tables but no `_prisma_migrations` history, baseline that existing schema before deploying migrations (do not reset a database containing data):

```powershell
pnpm --filter auth-service exec prisma migrate resolve --applied 20261028000000_initial
pnpm --filter family-service exec prisma migrate resolve --applied 20261028000000_initial
pnpm --filter family-service exec prisma migrate deploy
```

## Docker

Set a strong shared `JWT_SECRET` of at least 32 characters in the root `.env` file. Auth and family services must use the same secret because family service verifies auth access tokens. Then run the requested full stack:

For browser clients using refresh cookies, also set `CORS_ORIGIN` to a comma-separated allowlist of trusted app origins in the root `.env` file. Native Expo clients use bearer tokens and do not depend on browser CORS.

```powershell
docker compose up -d --build
```

To build and start only these services and their databases:

```powershell
docker compose up -d --build auth-service family-service
```

Check health using `docker compose ps` or `pnpm test:health` (the latter checks every service in the full compose stack).

## Mobile integration

The live API client and session provider are in `apps/mobile/src/services/`. Wrap the app root with `SessionProvider` and render the exported `FamilyScreenFlow` where the family tab/screen belongs. Existing auth screens can connect their `onSubmit` callbacks to `useSession().signIn` and `useSession().register`.

Set `EXPO_PUBLIC_AUTH_API_URL` and `EXPO_PUBLIC_FAMILY_API_URL` to reachable device URLs. For Android emulator, use `http://10.0.2.2:4001/api/auth` and `http://10.0.2.2:4002/api/family`; for iOS simulator use localhost; on physical devices use the development computer's LAN IP. Expo SecureStore persists native refresh tokens. The API also supports HTTP-only refresh cookies for browser clients.
