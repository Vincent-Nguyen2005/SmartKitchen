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
| `INVENTORY_UPLOAD_DIR` | no | Where item photos are stored. Defaults to `./uploads/inventory`; Docker uses `/data/uploads/inventory` on the `inventory-uploads` named volume. |

Production Docker Compose requires `JWT_SECRET` and `PURCHASE_SYNC_API_KEY` from the root `.env`. Copy `.env.example` and set unique random values before starting the services.

For local development, copy `.env.example` to the service's `.env`, point `DATABASE_URL` and `FAMILY_SERVICE_URL` at reachable local services, then run:

```bash
pnpm --filter inventory-service prisma:generate
pnpm --filter inventory-service prisma:deploy
pnpm --filter inventory-service dev
```

Build and static type-check with `pnpm --filter inventory-service build` and `pnpm --filter inventory-service lint`. Run the isolated unit suite with `pnpm --filter inventory-service test`; the test script generates the Prisma client and does not connect to a database or external service.

## API

Public inventory APIs require `Authorization: Bearer <access-token>`. Endpoints that read or change inventory also require the `familyId` to match the signed-in user's family, verified through `family-service`.

The service supports the prefixed paths below for direct calls and matching short paths (`/items`, `/alerts`, `/receipts`) for gateway requests, because the gateway strips `/api/inventory` before proxying.

| Method and path | Purpose |
| --- | --- |
| `GET /api/inventory/items?familyId=<uuid>&page=1&limit=20` | List family inventory with pagination; optional `search`, `categoryId`, `status`, and `storageLocation` filters. Returns `items` and `pagination`. |
| `POST /api/inventory/items` | Add a confirmed inventory item. Body requires `familyId` and `name`; quantity, unit, and storage location have defaults. Supports optional description, minimum quantity, category, expiry date, image URL, and 8–14 digit barcode. Returns the item in `data`. |
| `GET /api/inventory/items/:id?familyId=<uuid>` | Read one non-deleted item in the family, including recent inventory logs. |
| `POST /api/inventory/items/:id/photo` | Upload one product photo (multipart/form-data, JPEG/PNG/WebP, max 5 MB) for an item in your family. Re-encoded to JPEG at most 1024 px with metadata (EXIF/GPS) removed, stored under a random name; replaces and deletes the previous photo. Sets `imageUrl`. 413 too large, 400 wrong type, 403 other family. No image recognition. |
| `DELETE /api/inventory/items/:id/photo` | Remove the photo and its file. Deleting the item also deletes its photo file. |
| `GET /api/inventory/items/:id/photo/:file` | Serve the item's current photo to members of its family only (the `imageUrl` value). No directory listing; any other file name is 404. |

## One product, no accidental duplicates

- **Catalog product (`productId`):** on create and rename the server matches the name against the active admin catalog. The match is exact after `normalizeName` (NFC, trim, collapsed spaces, lower case, diacritics kept: "  CÀ  RỐT " = "Cà rốt", but "ca rot" ≠ "Cà rốt"), on the Vietnamese name, then on the English alias.
  - A match sets `productId`; renaming away clears it.
  - The client never sends `productId`.
  - If admin-service is unreachable, `productId` is left as it is and saving never fails.
- **`GET /api/inventory/items/match?familyId&name&unit`:** returns the matched catalog product (`id`, `name`, `imageUrl`) and `existing`, the family's oldest live row of the same product in the same unit, plus `otherUnits`.
  - The same product means the same `productId`, or the same normalized name (older rows have no `productId`).
  - Live means not expired, discarded or deleted. A consumed row may be topped up again.
  - Rows of other families are never considered.
- **`POST /api/inventory/items/:id/add?familyId`** (`{ quantity, unit, expiryDate? }`): "Cộng thêm", which the user explicitly chooses in the app.
  - Adds quantity atomically (SQL increment) and logs `MANUAL_MERGE`.
  - Same unit only, with no unit conversion: `409 UNIT_MISMATCH` otherwise.
  - Expiry: the earlier date is kept. The row then warns by its oldest stock, and a later date never hides an earlier one. A row without expiry takes the new date.
  - "Thêm riêng" is a normal create.
- **Đi chợ → Kho purchases** (`/internal/purchases`) are unchanged. They still restock automatically: same family, case-insensitive name, same unit; they set `productId` when missing.

## Photo name suggestions (Kho "Chụp ảnh")

`POST /api/inventory/photo/suggest` (signed-in family member; multipart, one JPEG / PNG / WebP image, max 5 MB) returns `{ suggestions: [{ name, catalogId, score }], confident, source }`, at most 3 names. The photo is analysed in memory and **never stored**. Errors: 401 without a token, 403 without a family, 400 wrong type (the declared type must match the file's bytes), 413 over 5 MB.

1. **CLIP:** zero-shot image classification on the CPU, using Transformers.js with quantized `Xenova/clip-vit-base-patch32`. The labels are the active catalog ingredients' `englishName` ("a photo of carrot"), read from admin-service's user catalog and cached for 10 minutes. The Vietnamese name is returned. Text embeddings are computed once per label list. The model is downloaded at image build time (`dist/scripts/download-clip-model.js`) and loaded offline (`allowRemoteModels = false`), so a request never downloads anything. Timeout 8 s.
2. **Gemini fallback:** used when the top CLIP probability is below `PHOTO_CLIP_THRESHOLD` (default 0.4) and `GEMINI_API_KEY` / `GEMINI_MODEL` are set. Gemini gets the photo and the catalog names, and returns strict JSON with at most 3 names from the list. Limits: `PHOTO_GEMINI_DAILY_LIMIT` calls per family per day (default 20, in memory) and a 10 s timeout.
3. **Otherwise** there are no suggestions (`confident: false`). The app never waits on this to save.

- **Suggestions:** each one also carries `productId` (= `catalogId`) and the product's `imageUrl`.
- **Image-to-image signal (`PHOTO_IMAGE_MATCH=on`, off by default):**
  - The photo is also compared with each catalog product's own image, using only the stored `imageUrl`.
  - Embeddings live in memory and are recomputed only when the URL changes. They're built in the background, one image every 2 s, pausing 10 minutes on HTTP 429.
  - The final score per product is `max(text, image)`, so a strong visual match can win and products without an image keep their text score. The 0.4 threshold applies to the final score.
  - **Why it's off:** it isn't measured yet. PR #89's evaluation photos are the catalog images themselves, so an image-to-image comparison would just find each photo itself. Measure it on fresh phone photos before enabling it.

### Enabling CLIP

`@huggingface/transformers` is **not a dependency yet** (adding it changes the lockfile). Until it is added, the image builds, the model step prints "skipping", and only the Gemini fallback runs. To enable CLIP:

```sh
pnpm --filter inventory-service add @huggingface/transformers@^3
docker build -t smartkitchen-inventory-service ./services/inventory-service
```

- **Base image:** Debian slim, not Alpine, because onnxruntime-node ships glibc binaries only.
- **CUDA download:** skipped during the build (`ONNXRUNTIME_NODE_INSTALL_CUDA=skip`).
- **Pruning:** only this CPU's onnxruntime binary is kept.

### Image size

| Image | Size |
|---|---|
| Before (Alpine) | 466 MB |
| Debian slim, without Transformers.js (this change) | 616 MB (+150 MB) |
| With Transformers.js (estimate) | about +330 MB more, so roughly 950 MB |

The estimate is made of:
- model 149 MB (text 62 MB + vision 85 MB, quantized)
- onnxruntime-node linux/x64 about 43 MB
- @huggingface/transformers about 48 MB
- onnxruntime-web about 92 MB (a dependency of the package)

### Accuracy (47 test photos, catalog Commons images; one-off check)

| Measure | Result |
|---|---|
| Top answer correct | 51% |
| Correct name among the 3 suggestions | 60% |
| At threshold 0.4: photos treated as confident | 30 |
| Of those, top answer correct | 67% (77% with the correct name among the chips) |

- **Mistakes are mostly look-alike catalog items:** Rau muống → Rau mùi, Kem tươi → Kem, Đậu xanh → Đậu Hà Lan, Đùi gà → Thịt gà, Bơ lạt → Quả bơ.
- **Packaged and liquid products are weak** (Giấm, Hạt nêm, Sữa tươi). Better `englishName` aliases help.
- **The check was cut short:** Wikimedia throttled the image downloads, so only 2 of the planned 20 "different photo" tests ran (Chuối right at 0.88; Khoai tây wrong at 0.09, which falls back to Gemini).

`productId` (optional, migration `20261130000000_item_product_id`): the admin catalog product id. It's set when the item comes from Giỏ hàng (`POST /api/inventory/internal/purchases` with `productId`), and a restock fills it only when missing. The app shows that product's image when the item has no photo of its own. The catalog image is never copied into `imageUrl` or the photo storage.
| `POST`/`PUT` `categoryName` | Optional free-text group ("Nhóm"); the category is created on first use. |
| `PUT /api/inventory/items/:id?familyId=<uuid>` | Update allowed item fields for the family. Returns the updated item in `data`. |
| `DELETE /api/inventory/items/:id?familyId=<uuid>` | Soft-delete a family item; the row is retained. |
| `GET /api/inventory/items/barcode/:barcode` | Look up a barcode in Open Food Facts. A missing product returns `found: false` for manual entry; catalog data is community-contributed and must be reviewed. |
| `GET /api/inventory/items/catalog/search?q=<name>` | Search the live Open Food Facts catalog by product name. Returns up to 8 results and does not add anything to family inventory until a user selects and confirms a product. Repeated queries are cached for 10 minutes; uncached searches are limited to 8 per minute per service instance. |
| `GET /api/inventory/alerts/expiring?familyId=<uuid>&days=3` | List items expiring within 1–30 days (3 by default). |
| `POST /api/inventory/alerts/refresh?familyId=<uuid>&days=3` | Update eligible item statuses to `NEAR_EXPIRY`; returns `updatedCount`. |
| `POST /api/inventory/receipts/ocr` | Recognize a receipt without saving items. Body: `{ "imageBase64": "...", "mimeType": "image/jpeg" }`. Valid JPEG, PNG or WebP images are limited to 5 MB. Returns OCR text and candidate lines for user review. |
| `POST /api/inventory/internal/purchases` | Internal-only purchase application. Requires `x-internal-api-key`; not a client/gateway endpoint. Uses `externalPurchaseId` as a durable idempotency key. |

All public endpoints require `Authorization: Bearer <access-token>`. Item and alert requests also require a `familyId` the signed-in user belongs to; membership is verified by `family-service`. Validation errors return `400`; authentication failures return `401`; inaccessible family data returns `403`; unavailable family verification returns `503`. Barcode lookup can return `502` when Open Food Facts is unavailable. OCR recognition failures return a retryable `503` and do not create inventory records.

Apply committed migrations and generate the Prisma client before building/deploying:

```bash
pnpm --filter inventory-service prisma:deploy
pnpm --filter inventory-service prisma:generate
```

The purchase application record is retained independently of the inventory item so a later retry cannot add the same shopping item twice after an item is deleted. The migration preserves existing inventory rows.

`externalPurchaseId` is unique and is inserted in the same database transaction as the item change and inventory log. Repeating the same ID returns the prior application; reusing it for a different family returns `409 PURCHASE_FAMILY_MISMATCH`. The purchase API accepts `familyId`, `createdByUserId`, `name`, positive `quantity`, `unit`, and `externalPurchaseId` in its JSON body. It is protected by the server-only `PURCHASE_SYNC_API_KEY`, which must never be sent by the mobile app.

## OCR limitations

OCR runs on the service using Tesseract.js and `vie+eng` by default. The service needs outbound access to download language data on its first OCR request unless `TESSERACT_LANG_PATH` points to a local or managed copy. OCR is approximate; candidate lines, quantity and unit must be reviewed before a mobile client saves anything.
