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

### Ingredient price

`price` is optional: an integer number of Vietnamese đồng, `>= 0`, or `null` for no price (migration `20261120000000_ingredient_price`, with a database `CHECK`). In the admin form it is **Giá (đ)**; an empty field saves `null`, and negative or fractional values are rejected with `400 VALIDATION_ERROR`. The price does not change the promotion sync to notification-service.

### Market catalog for signed-in users

`GET /catalog/ingredients` (gateway: `/api/admin/catalog/ingredients`) is readable by any signed-in user and backs the mobile **Đi chợ > Sản phẩm** grid and the Kho add-item suggestions. It returns active ingredients only, with public fields only:

`{ items: [{ id, name, group, unit, shelfLifeDays, imageUrl, discountPercent, promoEndDate, price }], page, limit, total, totalPages, groups }`

- `discountPercent` and `promoEndDate` are set only while the promotion is still valid (its last day, Vietnam time, has not passed); otherwise both are `null`.
- Query: `search` (accent-insensitive; `q` is still accepted), `group` (case-insensitive exact match), `onSale=true` (valid promotions only), `page` (default 1), `limit` (default 20, max 50).
- `groups` lists the distinct groups of active ingredients, for filter chips.
