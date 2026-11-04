# Notification service

`services/notification-service`, port 4010, database `notification_db` (local port 5410). Owner: Huy.

Last verified: 2026-11-04, commit `d792648`.

Stores in-app notifications, device push tokens, notification preferences, partner supermarkets and promotions; matches promotions to users and dispatches them (mock or Expo push).

## API

Paths are as seen by the service; through the gateway prefix them with `/api/notifications` (e.g. `GET /api/notifications/promotions`).

| Method and path | Guard | Purpose |
|---|---|---|
| `GET /health` | — | Liveness (`status: "OK"`) |
| `GET /notifications?userId=&status=&page=&limit=` | — (see limitations) | Inbox, newest first; `status` is `PENDING`, `SENT`, `FAILED` or `READ` |
| `PATCH /notifications/:id/read` | — | Mark one notification as read |
| `GET /preferences/:userId` | — | Preferences (created with defaults on first read) |
| `PUT /preferences/:userId` | — | `pushEnabled`, `promotionEnabled`, `quietHoursStart` / `quietHoursEnd` (`HH:mm` or `null`) |
| `POST /device-tokens` | — | `{ userId, token, platform: IOS \| ANDROID }`, upsert |
| `DELETE /device-tokens/:token` | — | Deactivate a token (204) |
| `GET /promotions?active=true&keyword=&page=&limit=` | — | Promotions; cached by the gateway when public |
| `POST /promotions/match` | — | `{ userId, keywords[] }` → active promotions with overlapping keywords |
| `POST /promotions/:id/dispatch` | — (see limitations) | `{ userIds?[] }`, send a promotion (defaults to every user with an active token) |
| `POST /partners` | `x-api-key: PARTNER_API_KEY` | Upsert a partner supermarket by name |
| `POST /partners/:partnerId/promotions` | `x-api-key: PARTNER_API_KEY` | Upsert 1–500 promotions by title (transaction) |
| `POST /internal/notifications` | `x-api-key: INTERNAL_API_KEY` | Create an in-app notification (used by admin-service). Not routable through the gateway |

Lists return `{ items, page, limit, total }` (`limit` max 100, default 20).

### Internal notifications

```json
POST /internal/notifications
x-api-key: <INTERNAL_API_KEY>
{ "userId": "u1", "type": "SYSTEM", "title": "Báo cáo đã được xử lý", "body": "…", "data": { "reportId": "…" } }
```

`type` is `SYSTEM` (default), `EXPIRY_ALERT` or `SHOPPING_REMINDER`. Answers `201` with the notification. API keys are compared as SHA-256 digests with `timingSafeEqual`; a missing server-side key rejects every request.

## Jobs

With `ENABLE_JOBS=true`, a cron (`PROMOTION_CRON`, default every 15 minutes) matches and dispatches promotions. Quiet hours (in `DEFAULT_TIMEZONE`, overnight ranges allowed) and `promotionEnabled=false` suppress sends. Enable jobs on **one** instance only.

## Errors

`{ error, message, details? }`, never a stack trace.

| Status | `error` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod validation failed (`details` = flattened issues) |
| 401 | `UNAUTHORIZED` | Wrong or missing `x-api-key` |
| 404 | `NOT_FOUND` | Unknown partner / record |
| 503 | `DATABASE_UNAVAILABLE` | Database down or table missing (P1001/P1002/P2021) |
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
| `DEFAULT_TIMEZONE` | `Asia/Ho_Chi_Minh` | Quiet-hours timezone |

## Database

Tables: `notifications`, `device_tokens`, `notification_preferences`, `partner_supermarkets`, `promotions`. Prisma 5.22.0 with a dedicated client output. The Docker image runs `prisma migrate deploy` on start. Schema changes only through new migrations.

## Known limitations (follow-ups)

- User routes take `userId` from the query, path or body instead of `x-user-id`, so a signed-in caller can read or change another user's inbox and preferences if they know the id. Planned fix: derive the user from `x-user-id` and reject mismatches.
- `POST /promotions/:id/dispatch` has no guard. Planned fix: require `ADMIN` or the internal key.

## Tests

`pnpm --filter notification-service test` (57 tests, 97.57 % line coverage at the last run).
