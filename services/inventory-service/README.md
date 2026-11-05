# inventory-service

**Owner:** Khanh. Pantry stock and ingredient inventory APIs.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | no | Defaults to `4003`. |
| `DATABASE_URL` | yes | Inventory PostgreSQL database. |
| `JWT_SECRET` | yes in production | Shared HS256 signing secret used to verify the bearer token. |
| `FAMILY_SERVICE_URL` | yes in production | Family API used to check that the signed-in user belongs to the requested family. |
| `PURCHASE_SYNC_API_KEY` | yes in production | Private key shared only by shopping-list-service and inventory-service for purchase synchronization. Never expose it to mobile or gateway clients. |
| `OPENFOODFACTS_USER_AGENT` | recommended | Descriptive User-Agent for barcode catalog lookups. Set a real support/contact address for a deployed app. |
| `TESSERACT_LANGUAGES` | no | Defaults to `vie+eng` for Vietnamese and English receipt text. |
| `TESSERACT_LANG_PATH` | no | Custom path or URL for Tesseract trained data. Without it, trained data downloads on the first OCR request and is cached by Tesseract.js. |

Production Docker Compose requires `JWT_SECRET` and `PURCHASE_SYNC_API_KEY` from the root `.env`. Copy `.env.example` and set unique random values before starting the services.

## API

Public inventory APIs require `Authorization: Bearer <access-token>`. Endpoints that read or change inventory also require the `familyId` to match the signed-in user's family, verified through `family-service`.

The service supports the prefixed paths below for direct calls and matching short paths (`/items`, `/alerts`, `/receipts`) for gateway requests, because the gateway strips `/api/inventory` before proxying.

| Method and path | Purpose |
| --- | --- |
| `GET /api/inventory/items?familyId=<uuid>&limit=100` | List family inventory. |
| `POST /api/inventory/items` | Add a confirmed inventory item. Accepts `familyId`, `name`, `quantity`, `unit`, `storageLocation`, and optional 8–14 digit `barcode`. |
| `GET /api/inventory/items/barcode/:barcode` | Look up a barcode in Open Food Facts. A missing product returns `found: false` for manual entry; catalog data is community-contributed and must be reviewed. |
| `POST /api/inventory/receipts/ocr` | Recognize a receipt without saving items. Body: `{ "imageBase64": "...", "mimeType": "image/jpeg" }`. Images are limited to 5 MB. Returns OCR text and candidate lines for the user to review. |
| `POST /api/inventory/internal/purchases` | Internal-only purchase application. Requires `x-internal-api-key`; not a client/gateway endpoint. Uses `externalPurchaseId` as a durable idempotency key. |

Run the migration and generate Prisma client before deployment:

```bash
pnpm --filter inventory-service prisma:deploy
pnpm --filter inventory-service prisma:generate
```

The purchase application record is retained independently of the inventory item so a later retry cannot add the same shopping item twice after an item is deleted. The migration preserves existing inventory rows.

## OCR limitations

OCR runs on the service using Tesseract.js and `vie+eng` by default. The service needs outbound access to download language data on its first OCR request unless `TESSERACT_LANG_PATH` points to a local or managed copy. OCR is approximate; candidate lines, quantity and unit must be reviewed before a mobile client saves anything.
