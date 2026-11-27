# shopping-list-service

**Owner:** Khanh. Shopping lists, reference items and purchase confirmation.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | no | Defaults to `4008`. |
| `DATABASE_URL` | yes | Shopping-list PostgreSQL database. |
| `JWT_SECRET` | yes in production | Shared HS256 signing secret used to verify the bearer token. |
| `FAMILY_SERVICE_URL` | yes in production | Family API used to verify ownership for every family-scoped request. |
| `INVENTORY_API_URL` | yes in production | Private inventory-service address, e.g. `http://inventory-service:4003`. |
| `PURCHASE_SYNC_API_KEY` | yes in production | Shared only with inventory-service for purchase sync. Never expose it to mobile or gateway clients. |

Production Docker Compose requires `JWT_SECRET` and `PURCHASE_SYNC_API_KEY` from the root `.env`.

For local development, copy `.env.example` to the service's `.env`, configure the database and reachable family/inventory service URLs, then run:

```bash
pnpm --filter shopping-list-service prisma:generate
pnpm --filter shopping-list-service prisma:deploy
pnpm --filter shopping-list-service dev
```

Build and static type-check with `pnpm --filter shopping-list-service build` and `pnpm --filter shopping-list-service lint`. Run the isolated unit suite with `pnpm --filter shopping-list-service test`; it mocks database and HTTP boundaries and does not call external services.

## API

Every `/api/shopping-list` route requires `Authorization: Bearer <access-token>`. Every family-scoped operation checks membership through `family-service`; the service does not trust a client-supplied user ID.

The same router is available at the service root for gateway requests, because the gateway removes `/api/shopping-list` before forwarding.

| Method and path | Purpose |
| --- | --- |
| `GET /api/shopping-list?familyId=<uuid>` | Lists active family shopping lists and their items. Returns `{ success, lists }`. |
| `GET /api/shopping-list/suggestions?familyId=<uuid>` | Returns up to five frequently purchased item suggestions in `data`. |
| `POST /api/shopping-list/items` | Saves a reference item. Body: `{ "familyId": "...", "name": "Sữa", "quantity": 2, "unit": "BOX" }`; optional `shoppingListId` and `note` are supported. This does not modify inventory. |
| `POST /api/shopping-list/items/:id/purchase?familyId=<uuid>` | Applies the item quantity to inventory and only then marks it purchased. Safe to retry; inventory stores a durable unique external purchase ID. |
| `POST /api/shopping-list/generate` | Creates a shopping list from inventory warnings. Body: `{ "familyId": "..." }`; the caller's bearer token is forwarded to inventory for the read. |
| `PATCH /api/shopping-list/items/:id?familyId=<uuid>` | Changes quantity or note on an unpurchased item in an active list. |
| `PATCH /api/shopping-list/:id/complete?familyId=<uuid>` | Completes an active list. |

Every route requires `Authorization: Bearer <access-token>` and checks that the verified user belongs to the requested family. Validation errors return `400`, missing records return `404`, invalid list/item state returns `409`, and unavailable family or inventory services return `503`. The gateway removes `/api/shopping-list` before forwarding, so it also mounts the same router at the service root.

The purchase endpoint uses a transaction in inventory-service and a service-to-service secret. If inventory is unavailable or rejects the update, this service returns a retryable error and does not mark the item as synced. `inventoryAppliedAt` distinguishes confirmed inventory sync from older purchased rows that predate this flow.

Saving an item means **Để tham khảo** only. Confirming a purchase sends the shopping item's stable ID as `externalPurchaseId` to `POST /api/inventory/internal/purchases`, using `PURCHASE_SYNC_API_KEY` on the server-to-server request. Inventory records the application idempotently. Only after inventory accepts the request does this service mark `isPurchased`, set `inventoryAppliedAt`/`inventoryItemId`, and upsert purchase history. A timeout or rejected response returns `503 INVENTORY_SYNC_FAILED`; retrying the same item will not add its quantity twice.

The private purchase key is configured in both services' server environments and is never included in the mobile app or a public API response. Production requires a real value in the root environment; the development fallback is only for local non-production use.

Apply schema changes and generate the Prisma client before deployment:

```bash
pnpm --filter shopping-list-service prisma:deploy
pnpm --filter shopping-list-service prisma:generate
```

## Delivery orders (Đặt hàng, cash on delivery)

`POST /api/shopping-list/checkout` with `{ familyId, items: [{ id, categoryName?, shelfLifeDays? }], delivery: { address, latitude?, longitude?, receiverName, receiverPhone, note?, paymentMethod: "COD" } }` turns the cart into one order (201 `{ order }`). The phone must be a Vietnamese number. inventory-service first creates "Đang giao" Kho rows (`POST /api/inventory/internal/deliveries/pending`); if that fails nothing is written and the cart stays. The ordered lines leave the cart (`purchaseId` set) and the list is completed when nothing is left.

| Status | Set by | Next |
|---|---|---|
| `PENDING` (đã đặt) | the order | `SHIPPING` (shipper accepts) or `CANCELLED` (family) |
| `SHIPPING` (đang giao) | `POST /shipper/orders/:id/accept` | `DELIVERED` or `FAILED` (that shipper only) |
| `DELIVERED` (đã giao) | `POST /shipper/orders/:id/deliver` | final: Kho rows become normal PURCHASE rows (expiry = delivery day in Vietnam + shelf life, merged by the purchase rules), lines marked bought |
| `CANCELLED` (đã hủy) | `POST /orders/:id/cancel?familyId` while PENDING | final: "Đang giao" rows removed |
| `FAILED` (không giao được) | `POST /shipper/orders/:id/fail` `{ reason }` | final: "Đang giao" rows removed |

- Transitions are conditional updates (status in the WHERE), so a race can't skip a state; repeating a transition answers the order and re-runs its Kho step (idempotent).
- Customer endpoints check family membership: `GET /orders?familyId` (newest first), `GET /orders/last-delivery?familyId` (the caller's last address / receiver, to prefill), `POST /orders/:id/cancel?familyId`. Another family's order is 404.
- **Shipper endpoints:**
  - **Access:** the token needs the `SHIPPER` role, and the account must still be active in auth-service (checked with `AUTH_SERVICE_URL`, cached 30 s). Otherwise 403 (`SHIPPER_ONLY` / `SHIPPER_DISABLED`).
  - **Lists:** `GET /shipper/orders?scope=available|mine|history&lat&lng`. `available` is the waiting orders, nearest first when `lat` / `lng` are given, else oldest first. `mine` is the caller's SHIPPING orders. `history` is the caller's DELIVERED / FAILED orders of the last 30 days.
  - **Detail:** `GET /shipper/orders/:id` returns a waiting order or one of the caller's (404 otherwise).
  - **Fields:** address, lat / lng, `distanceKm`, receiver name / phone, note, COD amount, and a receipt per line (`unitPrice` after discount, `originalUnitPrice` when discounted, `lineTotal`). No family, buyer or other user data.
  - **Accept race:** a second shipper accepting the same order gets 409 "Đơn đã có người nhận.".
- **Buyer notices:** on SHIPPING, DELIVERED and FAILED the buyer gets a Thông báo feed row via notification-service `POST /internal/notifications` (`NOTIFICATION_SERVICE_URL`): "Đơn hàng đang được giao", "Đơn hàng đã giao thành công", "Đơn hàng không giao được: <lý do>". These are in-app only (no push), with data `{ type: "order", orderId, status }` and `dedupeKey: order:<id>:<status>`, so retries add no second row. They count in the bell badge.
- **Shipper on customer orders:** `GET /orders` adds `shipper: { name, phone }` once an order is SHIPPING (and after), from auth-service profiles; it never includes the shipper id or email.
- **Internal (admin-service):**
  - `GET /internal/shippers/stats?ids=` returns delivered counts.
  - `POST /internal/shippers/:id/release` sends a disabled shipper's SHIPPING orders back to PENDING with no shipper, so another shipper can take them. Their Kho rows stay "Đang giao".
- Purchases from before orders existed are `DELIVERED` (migration `20261215000000_delivery_orders`). A single-item purchase (`POST /items/:id/purchase`, not used by the app) is recorded as already delivered.

## "Chi tiêu" (GET /spending)

`GET /api/shopping-list/spending?familyId=<uuid>&month=YYYY-MM&page=1&limit=50` (members of that family only: 403 otherwise; `month` defaults to the current Vietnam month) returns:

```
{ month, previousMonth, total, previousTotal, changePercent | null, purchaseCount,
  groups: [{ name, amount, percent }],              // top 6 catalog groups, the rest and lines without a group in "Khác"
  purchases: { page, limit, total, items: [{ id, purchasedAt, buyerUserId | null, itemCount, total,
    lines: [{ id, name, quantity, unit, unitLabel, unitPrice, originalUnitPrice, discountPercent, lineTotal, group }] }] } }
```

- **What counts:** only `DELIVERED` orders, in the month of their delivery (`deliveredAt`); pending, shipping, cancelled and failed orders never count. Payment is cash on delivery (payment-service is not involved).
- **Amounts:** the checkout's rounding, snapshotted on each line when bought: paid unit price = round(unitPrice × (100 − discount%) / 100), line total = round(paid × quantity), purchase total = sum of the rounded line totals (lines without a price: 0). Totals, groups (percent of the month, whole numbers) and the comparison (whole % vs the previous month; null when that was 0) are computed here.
- **Months:** Vietnam calendar months (UTC+7). Purchases newest first; the list is paginated, totals and groups cover the whole month.
- **People:** only `buyerUserId`; the app shows the member's name and avatar from the family it already loaded. Every new purchase has a buyer (recording without one is refused, 400). The purchases migration `20261214000000_purchases` backfilled without a buyer are removed by `scripts/data-fixes/2026-12-delete-unknown-buyer-purchases.js`, so "Chi tiêu" starts with purchases made after this release.

## Internal: product usage

`GET /internal/products/:productId/usage` (x-api-key = `INTERNAL_API_KEY`, at least 32 characters; the gateway answers 404 for `/internal/*`) returns `{ items }`, the number of shopping-list items added from that admin catalog product. admin-service calls it before deleting a catalog ingredient.

## "Thêm vào Giỏ hàng" from "Cần mua tuần này"

`POST /items/ensure` (`{ familyId, items: [{ name, quantity, unit, productId?, unitPrice?, discountPercent?, imageUrl? }] }`) puts each item in the family's cart with **at least** that quantity. The same product and unit already in the cart is raised to that amount, never added twice, so the request is idempotent. Other items are added. The normal `POST /items` (Đi chợ) still adds quantities.
