# Đi chợ and Giỏ hàng (Huy)

The screen calls the gateway through the shared `gatewayFetch` with the bearer token and family from `useSession()`.

## Đi chợ (main view)

- Active products from Quản trị > Nguyên liệu (`GET /api/admin/catalog/ingredients`), 20 per page, with the shared `SearchBar` (same box as Kho), group chips when there is more than one group, and "Giảm X%" badges.
- Tapping a product opens a sheet: image, name, price (discounted price when on sale), quantity stepper and unit, **Thêm vào giỏ**. A Wikimedia Commons photo shows a small credit line "Ảnh: <author>, <license>, Wikimedia Commons"; tapping it opens the file page. The same product and unit already in the cart only gets a higher quantity (server-side merge in shopping-list-service). Toast: "Đã thêm vào giỏ hàng".
- A floating cart button (badge = number of cart lines) opens Giỏ hàng.
- Auto refresh every 30 s while the tab is open and the app is in the foreground, pull-to-refresh, and refresh after adding.

## Giỏ hàng

- Giỏ hàng is the family's active shopping list: every line not yet in Kho. Each line shows image, name, quantity stepper, unit, unit price and line total, and can be removed. Lines without a price show "Chưa có giá" and count as 0.
- Prices: the snapshot stored on the line when it was added (`unitPrice`, `discountPercent`, `productId`, `imageUrl`); older lines use the current catalog price looked up by name (accent-insensitive).
- **Mua** (after "Thêm N món vào Kho?") calls `POST /api/shopping-list/checkout`. shopping-list-service runs the existing per-item purchase into inventory (internal key, idempotent per item) with the catalog group and an expiry of today + shelf-life days when known. Failed lines stay in the cart and are listed; when every line succeeded the list is completed and the cart is empty. Toast: "Đã thêm vào Kho".
- Khuyến mãi **Mua** adds to Giỏ hàng with the same snapshot (catalog product with the promotion's name).

Hidden from the UI (APIs kept in `shoppingApi.ts`): the "Lưu món để tham khảo" form, usage suggestions, "Tạo danh sách từ thực đơn", and the per-item "Đã mua" / "Sửa" / "Hoàn tất" actions.

The shopping service verifies the JWT and family membership and uses the server-side `PURCHASE_SYNC_API_KEY` for inventory; no service secret is in the app.
