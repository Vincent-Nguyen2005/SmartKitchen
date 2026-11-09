# Payment Service

Owner: Cuong. Responsibility: payment intents, transactions, and payment provider integration.

## Database

Set `DATABASE_URL`, then run `pnpm --filter payment-service db:push` to create/update
the payment table and `pnpm --filter payment-service db:generate` to generate Prisma Client.

## Provider configuration

Set the same `JWT_SECRET` used by auth-service and the gateway. Configure
`PAYMENT_PUBLIC_BASE_URL` as a URL reachable by the provider (the API gateway URL
in production). `PAYMENT_APP_RETURN_URL` defaults to
`smartkitchen://payment-result`.

VNPAY requires `VNPAY_TMN_CODE` and `VNPAY_HASH_SECRET`. MoMo requires
`MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, and `MOMO_SECRET_KEY`. Sandbox endpoint
defaults are used unless `VNPAY_PAYMENT_URL` or `MOMO_CREATE_URL` is set.
Provider callbacks are signature-verified before a payment status is changed.

Authenticated API routes:

- `POST /api/payments/create` (also available at `/create` behind the gateway)
- `GET /api/payments/:id/status` (also available at `/:id/status` behind the gateway)

Provider callback routes are `GET /api/payments/callback` for VNPAY and
`POST /api/payments/callback/momo` for MoMo. Provider callbacks do not require a
user access token; they require a valid provider signature.

The Sprint 3 mobile checkout is explicitly a demo: it submits
`mock-order-123` for `50,000 VND`. The payment endpoint accepts the submitted
amount and does not reconcile it with an order service. Do not use this flow for
real orders or production payments.