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

## Internal: product usage

`GET /internal/products/:productId/usage` (x-api-key = `INTERNAL_API_KEY`, at least 32 characters; the gateway answers 404 for `/internal/*`) returns `{ items }`, the number of shopping-list items added from that admin catalog product. admin-service calls it before deleting a catalog ingredient.

## "Thêm vào Giỏ hàng" from "Cần mua tuần này"

`POST /items/ensure` (`{ familyId, items: [{ name, quantity, unit, productId?, unitPrice?, discountPercent?, imageUrl? }] }`) puts each item in the family's cart with **at least** that quantity. The same product and unit already in the cart is raised to that amount, never added twice, so the request is idempotent. Other items are added. The normal `POST /items` (Đi chợ) still adds quantities.
