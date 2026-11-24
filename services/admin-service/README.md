# Admin Service

Owner: Huy. Responsibility: administrative controls and platform operations APIs.

## Database Schema

- `MasterIngredient`: stores the managed ingredient catalog and nutrition metadata, plus optional market fields: `imageUrl` (pasted https link), `discountPercent` / `promoEndDate` (promotion), and `price` (whole VND, `>= 0`, nullable).
- `RecommendationWeight`: stores configurable recommendation weights.
- `RecommendationWeightHistory`: records changes to recommendation weights.
- `ServiceHealthLog`: stores service monitoring checks and response times.
- `AccountReport`: stores user account reports and resolution state.
- `AuditLog`: stores administrative actions and target metadata.

User IDs are plain strings because this service has its own database and does not create cross-service foreign keys.

## Ingredients & Weights

Ingredient mutations, import/export, soft deletion, and recommendation-weight changes require `x-user-id` and `x-user-role: ADMIN` from the internal gateway. These headers are trusted only on the private service network until Auth Service JWT verification is available. Weight updates use optimistic locking with `expectedVersion`; values are validated in `[0, 1]` and the documented defaults are not normalized, so callers may choose their own total.

### Deleting an ingredient

`DELETE /ingredients/:id` (ADMIN) deletes for good, but only when nothing still uses the ingredient:
- **Checked:** its synced promotion in notification-service (running, or already sent to users) and shopping-list items added from the market (`productId`), both through `/internal/...` with `INTERNAL_API_KEY`; also the row's own running discount. Inventory, recipes and menus store names, not catalog ids.
- **In use:** `409 { code: "IN_USE", reasons }` and nothing is deleted; the admin can hide it instead.
- **Not in use:** the row is deleted (a never-sent synced promotion is removed too) and a `DELETE` audit row keeps the old values. The starter catalog seed skips names with such an audit row, so a deleted starter ingredient does not come back.
- **A check cannot be answered:** `503 USAGE_CHECK_UNAVAILABLE`, nothing deleted.

### Promotion window

A discount has a first and a last day: `promoStartDate` (migration `20261202000000_ingredient_promo_start_date`) and `promoEndDate`, both Vietnam calendar days.
- **Defaults:** if not given, start = today and end = start + 7 days.
- **Validation:** end before start is `400`, on create and on partial updates. Removing the discount clears both dates.
- **Đi chợ:** a discount is shown only from the first day through the whole last day.
- **Sync:** the synced notification-service promotion runs from 00:00 of the first day to 23:59:59.999 of the last day (+07:00), so it appears and disappears in Thông báo by itself.
- **Admin list:** shows "Sắp diễn ra / Đang chạy / Hết hạn".
- **Backfill:** existing discounts were already running, so they start today (never after their last day); one without a last day ends 7 days later. No far-future dates.

### Ingredient price

`price` is optional: an integer number of Vietnamese đồng, `>= 0`, or `null` for no price (migration `20261120000000_ingredient_price`, with a database `CHECK`). In the admin form it is **Giá (đ)**; an empty field saves `null`, and negative or fractional values are rejected with `400 VALIDATION_ERROR`. The price does not change the promotion sync to notification-service.

### Starter catalog and licensed images

- **Starter catalog:** at start, `seedMissingIngredients` (`src/seed/seed-catalog.ts`, data in `src/seed/catalog.data.ts`) adds about 100 common Vietnamese market ingredients whose name is missing.
  - Groups: Rau củ, Trái cây, Thịt, Hải sản, Trứng & sữa, Đồ khô & gạo, Gia vị, Đồ uống, Đồ đông lạnh.
  - Each has a shared unit code, `shelfLifeDays` and kcal per 100 g. `catalog-details.ts` adds a market price for the sale unit (approximate late-2026 retail, rounded to 500 VND; GRAM-unit products per gram), protein/carbs/fat per 100 g and obvious allergens.
  - It includes every ingredient the starter recipes use, so "Cần mua tuần này" can find them in Đi chợ.
  - The 30 staples also get protein / carbs / fat per 100 g (`catalogMacros`).
  - Every starter ingredient gets `englishName`, an English alias used for Kho photo recognition. It comes from `en`, with `ENGLISH_NAME_OVERRIDES` where a search term isn't how a photo would be described (migration `20261201000000_ingredient_english_name`). The admin form calls it "Tên tiếng Anh (nhận diện ảnh)", and the user catalog returns it. The list also includes the ingredients the foreign starter dishes need (Mì Ý, Kem tươi, Rong biển, Kim chi, Tương ớt Hàn...).
  - Existing databases are corrected with `scripts/data-fixes/` (see its README).
  - Existing rows are never updated or deleted, and names an admin deleted or renamed are skipped, so running it again changes nothing. The log gives a count.
- **Image credit:** `imageSource` (Commons file page), `imageAuthor` and `imageLicense` are stored with an image that came from Wikimedia Commons (migration `20261127000000_ingredient_image_credit`).
  - When an admin saves a different image link without credit fields, the old credit is cleared.
  - The market catalog returns the credit, and the app shows "Ảnh: <author>, <license>, Wikimedia Commons".
- **`scripts/fill-catalog-images`** (root `.sh` / `.ps1`; it runs `node dist/scripts/fill-catalog-images.js` inside the admin-service container) looks up a photo for every ingredient WITHOUT an image.
  - **Search:** the Commons API, English name first, then the Vietnamese name.
  - **What's accepted:** reusable licenses only (CC0, CC BY, CC BY-SA, public domain; never NC or ND), photos at least 400 px wide, and a file title containing every word of the term. Vietnamese terms must match with their accents, and titles of drawings, maps or plants are skipped.
  - **What's stored:** the upload.wikimedia.org thumbnail (about 500 px) and its credit. The update also requires the image to be still empty, so an image an admin set is never overwritten.
  - **Pacing:** one request every 1.5 s; on HTTP 429 it waits as long as `Retry-After` asks.
  - **Options:** `--dry-run` shows what would be set; `--limit N` stops after N ingredients. It prints the counts and the names with no confident match.

### Market catalog for signed-in users

`GET /catalog/ingredients` (gateway: `/api/admin/catalog/ingredients`) is readable by any signed-in user and backs the mobile **Đi chợ > Sản phẩm** grid and the Kho add-item suggestions. It returns active ingredients only, with public fields only:

`{ items: [{ id, name, group, unit, shelfLifeDays, imageUrl, discountPercent, promoEndDate, price }], page, limit, total, totalPages, groups }`

- `discountPercent` and `promoEndDate` are set only while the promotion is still valid (its last day, Vietnam time, has not passed); otherwise both are `null`.
- Query: `search` (accent-insensitive; `q` is still accepted), `group` (case-insensitive exact match), `onSale=true` (valid promotions only), `page` (default 1), `limit` (default 20, max 50).
- `groups` lists the distinct groups of active ingredients, for filter chips.
