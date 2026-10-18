# API Gateway

Owner: Huy. Responsibility: reverse proxy and service health aggregation for the SmartKitchen APIs.

## Routing

The route table lives in `src/config/routes.ts`. Gateway prefixes strip the `/api/<prefix>` segment before forwarding. For example, `GET /api/notifications/health` is forwarded as `GET /health` to the Notification Service. Service owners should mount their handlers at the root path expected after stripping.

`GET /health` reports the gateway process status. `GET /api/health` checks all eleven services in parallel with a two-second timeout per service and returns `503` with `DEGRADED` when any service is down.

JWT authentication is intentionally a no-op placeholder until the Auth Service contract is ready. Caching and rate limiting are deferred to Sprint 3.
