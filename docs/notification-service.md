# Notification service

`services/notification-service`, port 4010, database `notification_db` (local port 5410). Owner: Huy.

Last verified: 2026-11-06, branch `fix/sprint-4-followups-v2` (on top of main `ac3f750`).

Stores in-app notifications, device push tokens, notification preferences, partner supermarkets and promotions; matches promotions to users and dispatches them (mock or Expo push).

## API

Paths are as seen by the service; through the gateway prefix them with `/api/notifications` (e.g. `GET /api/notifications/promotions`).

| Method and path | Guard | Purpose |
|---|---|---|
| `GET /health` | — | Liveness (`status: "OK"`) |
| `GET /notifications?status=&page=&limit=` | user | The caller's inbox, newest first; `status` is `PENDING`, `SENT`, `FAILED` or `READ` |
| `PATCH /notifications/:id/read` | user (owner) | Mark one of the caller's notifications as read; `404` if it is not theirs |
| `GET /preferences` | user | The caller's preferences (created with defaults on first read). **Unused:** the app no longer has "Cài đặt thông báo" and dispatch ignores these values |
| `PUT /preferences` | user | `pushEnabled`, `promotionEnabled`, `quietHoursStart` / `quietHoursEnd` (`HH:mm` or `null`) |
| `GET` / `PUT /preferences/:userId` | user | Kept for older clients; `:userId` must be the caller (`403` otherwise) |
| `POST /device-tokens` | user | `{ token, platform: IOS \| ANDROID }`, upsert for the caller. A token identifies a device, so it moves to the account now signed in on that device |
| `DELETE /device-tokens/:token` | user (owner) | Deactivate one of the caller's tokens (`204`); `404` if it is not theirs |
| `GET /promotions?active=true&keyword=&page=&limit=` | — | Promotions; cached by the gateway when public |
| `POST /promotions/match` | — | `{ userId, keywords[] }` → active promotions with overlapping keywords (reads no user data) |
| `POST /promotions/:id/dispatch` | ADMIN | `{ userIds?[] }`, send a promotion (defaults to every user with an active token) |
| `POST /partners` | `x-api-key: PARTNER_API_KEY` | Upsert a partner supermarket by name |
| `POST /partners/:partnerId/promotions` | `x-api-key: PARTNER_API_KEY` | Upsert 1–500 promotions by title (transaction) |
| `POST /internal/notifications` | `x-api-key: INTERNAL_API_KEY` | Create an in-app notification (used by admin-service). Not routable through the gateway |
| `PUT /internal/promotions/:externalId` | `x-api-key: INTERNAL_API_KEY` | Create or update (idempotent by `externalId`) an active promotion; creates the partner (default "SmartKitchen") on first use. Used by admin-service for discounted ingredients (`admin-ingredient:<id>`). Not routable through the gateway |
| `POST /internal/promotions/:externalId/deactivate` | `x-api-key: INTERNAL_API_KEY` | Set that promotion `isActive=false` (unknown ids: no-op). Not routable through the gateway |

Lists return `{ items, page, limit, total }` (`limit` max 100, default 20).

### Identity and ownership

- **user**: the caller is `x-user-id`, which only the gateway sets from a verified access token (it deletes client-supplied identity headers first; see [gateway.md](gateway.md)). Missing → `401 UNAUTHORIZED`.
- A `userId` sent by a client (query, path or body) is never used as identity. If it names a different user, the request is rejected with `403 FORBIDDEN`. There is no admin override, because no admin feature reads another user's inbox, preferences or tokens.
- Reads and updates of single records (mark-read, token delete) are scoped to the caller's own rows. Someone else's record answers `404 NOT_FOUND`, the same as a missing one, so existence is not leaked.
- **ADMIN**: `x-user-role` must be `ADMIN` (`401` without identity, `403` otherwise). Dispatch is an operator action (admin screens, support). Partners only ingest promotions and must not be able to push to every user, so the partner key is **not** accepted for dispatch. The scheduled job calls the dispatch service directly, not over HTTP.
- The gateway never caches these routes: they are not cacheable prefixes, and Bearer requests always bypass the cache (covered by gateway tests).

### Internal notifications

```json
POST /internal/notifications
x-api-key: <INTERNAL_API_KEY>
{ "userId": "u1", "type": "SYSTEM", "title": "Báo cáo đã được xử lý", "body": "…", "data": { "reportId": "…" } }
```

`type` is `SYSTEM` (default), `EXPIRY_ALERT` or `SHOPPING_REMINDER`. Answers `201` with the notification. API keys are compared as SHA-256 digests with `timingSafeEqual`; a missing server-side key rejects every request.

## Jobs

With `ENABLE_JOBS=true`, a cron (`PROMOTION_CRON`, default every 15 minutes) matches and dispatches promotions. Stored preferences (push / promotion off, quiet hours) are ignored since the app's "Cài đặt thông báo" was removed: every user with an active token gets each promotion once. The rows stay in `notification_preferences`. Promotion **push** has a fixed quiet window, 22:00–07:00 Asia/Ho_Chi_Minh (not configurable): nothing is created or sent inside it, and the first run from 07:00 sends whatever is still active (a promotion that ended overnight is skipped; still once per user). Enable jobs on **one** instance only.

**"Chào buổi sáng ☀️" (the only daily push).** Same `ENABLE_JOBS` switch; cron every 5 minutes 07:00–09:55 Asia/Ho_Chi_Minh. One push per user per Vietnam day to users with an active token: "Chúc bạn một ngày vui vẻ! Bữa sáng nay: A, B." (family breakfast for today from menu-service `POST /internal/breakfast-today` with `INTERNAL_API_KEY` and `MENU_SERVICE_URL`; at most 3 names, then "…"; greeting only without a family / menu or when menu-service is down). Tap data `{ type: "morning", screen: "menu", meal: "BREAKFAST", day }` (or `screen: "home"`) opens Lịch on today's breakfast. A `morning_pushes` row (userId, day) is written before sending, so restarts and retries never send twice; a missed 07:00 is caught up until 09:59, then the day is skipped. Push only: no `notifications` row, not in the feed or the bell badge. Logs carry counts only.

## Errors

`{ error, message, details? }`, never a stack trace.

| Status | `error` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod validation failed (`details` = flattened issues) |
| 401 | `UNAUTHORIZED` | Missing `x-user-id`, or wrong / missing `x-api-key` |
| 403 | `FORBIDDEN` | `userId` names another user, or dispatch without the `ADMIN` role |
| 404 | `NOT_FOUND` | Unknown partner / record, or a record owned by another user |
| 503 | `DATABASE_UNAVAILABLE` | Database unreachable, connection dropped or timed out, pool exhausted, or table missing (Prisma P1001, P1002, P1008, P1017, P2021, P2024, initialization errors). The service keeps running and recovers when the database is back |
| 500 | `INTERNAL_ERROR` | Anything else |

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 4010 | Listen port |
| `DATABASE_URL` | local 5410 | Postgres connection string |
| `PARTNER_API_KEY` | — | Key for `/partners*` |
| `INTERNAL_API_KEY` | — | Key for `/internal/*`; must equal admin-service's |
| `PUSH_PROVIDER` | `mock` | `mock` or `expo` |
| `EXPO_ACCESS_TOKEN` | — | Optional, for Expo push |
| `ENABLE_JOBS` | false | Promotion cron |
| `PROMOTION_CRON` | `*/15 * * * *` | Cron expression |
| `DEFAULT_TIMEZONE` | `Asia/Ho_Chi_Minh` | No longer read (was the quiet-hours timezone) |

## Database

Tables: `notifications`, `device_tokens`, `notification_preferences`, `partner_supermarkets`, `promotions` (`externalId`, unique and nullable, identifies promotions synced from other services). Prisma 5.22.0 with a dedicated client output. The Docker image runs `prisma migrate deploy` on start. Schema changes only through new migrations.

## Tests

`pnpm --filter notification-service test` (89 tests, 97.99 % line coverage at the last run), including IDOR attempts (user A on user B's inbox, preferences and tokens), missing identity and the dispatch role check.
