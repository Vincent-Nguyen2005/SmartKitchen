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

## API

Every `/api/shopping-list` route requires `Authorization: Bearer <access-token>`. Every family-scoped operation checks membership through `family-service`; the service does not trust a client-supplied user ID.

The same router is available at the service root for gateway requests, because the gateway removes `/api/shopping-list` before forwarding.

| Method and path | Purpose |
| --- | --- |
| `GET /api/shopping-list?familyId=<uuid>` | Lists active shopping lists and their items. |
| `GET /api/shopping-list/suggestions?familyId=<uuid>` | Suggests items from prior purchases. |
| `POST /api/shopping-list/items` | Saves a reference item. Body: `{ "familyId": "...", "name": "Sữa", "quantity": 2, "unit": "BOX" }`. This does not modify inventory. |
| `POST /api/shopping-list/items/:id/purchase?familyId=<uuid>` | Applies the item quantity to inventory and only then marks it purchased. Safe to retry; inventory stores a durable unique external purchase ID. |
| `POST /api/shopping-list/generate` | Creates a shopping list from inventory warnings. Body: `{ "familyId": "..." }`. |
| `PATCH /api/shopping-list/items/:id?familyId=<uuid>` | Changes quantity or note on an unpurchased item. |
| `PATCH /api/shopping-list/:id/complete?familyId=<uuid>` | Completes an active list. |

The purchase endpoint uses a transaction in inventory-service and a service-to-service secret. If inventory is unavailable or rejects the update, this service returns a retryable error and does not mark the item as synced. `inventoryAppliedAt` distinguishes confirmed inventory sync from older purchased rows that predate this flow.

Apply schema changes and generate the Prisma client before deployment:

```bash
pnpm --filter shopping-list-service prisma:deploy
pnpm --filter shopping-list-service prisma:generate
```
