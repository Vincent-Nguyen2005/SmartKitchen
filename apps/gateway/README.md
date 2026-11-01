# API Gateway

Owner: Huy. Responsibility: reverse proxy and service health aggregation for the SmartKitchen APIs.

## Routing

The route table lives in `src/config/routes.ts`. Gateway prefixes strip the `/api/<prefix>` segment before forwarding. For example, `GET /api/notifications/health` is forwarded as `GET /health` to the Notification Service. Service owners should mount their handlers at the root path expected after stripping.

`GET /health` reports the gateway process status. `GET /api/health` checks all eleven services in parallel with a two-second timeout per service and returns `503` with `DEGRADED` when any service is down.

JWT authentication is intentionally a no-op placeholder until the Auth Service contract is ready.

## Rate Limiting & Caching

The gateway applies an in-memory IP limiter to `/api/*` and a stricter limiter to `/api/auth`. `GET /health` and `GET /api/health` are exempt. Set `TRUST_PROXY=true` only when the gateway is behind a trusted proxy. Cache responses are limited to public, idempotent `GET /api/recipes/health` and `/api/notifications/promotions` requests; authenticated or `Cache-Control: no-cache` requests receive `x-cache: BYPASS`. `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, `CACHE_TTL_SECONDS`, and `CACHE_MAX_ITEMS` configure the defaults.
