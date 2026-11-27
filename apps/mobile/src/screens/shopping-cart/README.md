# Đi chợ and Giỏ hàng (Huy)

The screen calls the gateway through the shared `gatewayFetch` with the bearer token and family from `useSession()`.

## Đi chợ (main view)

- Active products from Quản trị > Nguyên liệu (`GET /api/admin/catalog/ingredients`), 20 per page, with the shared `SearchBar` (same box as Kho), group chips when there is more than one group, and "Giảm X%" badges.
- Tapping a product opens a sheet: image, name, price (discounted price when on sale), quantity stepper and unit, **Thêm vào giỏ**. Image credits are not shown to users (they stay in the catalog and in Quản trị › Nguyên liệu). The same product and unit already in the cart only gets a higher quantity (server-side merge in shopping-list-service). Toast: "Đã thêm vào giỏ hàng".
- A floating cart button (badge = number of cart lines) opens Giỏ hàng.
- Auto refresh every 30 s while the tab is open and the app is in the foreground, pull-to-refresh, and refresh after adding.

## Giỏ hàng

- Giỏ hàng is the family's active shopping list: every line not yet in Kho. Each line shows image, name, quantity stepper, unit, unit price and line total, and can be removed. Lines without a price show "Chưa có giá" and count as 0.
- Prices: the snapshot stored on the line when it was added (`unitPrice`, `discountPercent`, `productId`, `imageUrl`); older lines use the current catalog price looked up by name (accent-insensitive).
- **Mua** opens **Đặt hàng** (`CheckoutSheet.tsx`):
  - **Address:** prefilled from the member's last order, otherwise from the phone's location (permission asked at that moment, then reverse geocoded on the device to a Vietnamese address). It stays editable, and "Dùng vị trí hiện tại" fills it again. The map button opens `MapPicker.tsx`: OpenStreetMap / Leaflet through `components/MapFrame.tsx` (a WebView on phones, an iframe on web, both with two-way messages), no API key, with a draggable pin, "Dùng vị trí hiện tại" and "Xác nhận vị trí". If location is denied, the address is typed by hand.
  - **Location and address (`geocode.ts`):** phones use expo-location and the device's geocoder. On web, expo-location uses the browser's geolocation (needs https or localhost), but it cannot reverse geocode there, so the address comes from OpenStreetMap Nominatim (`nominatim.openstreetmap.org`). That sends the coordinates to OSM, and only after the pin rests for 0.8 s, staying within Nominatim's limit of about one request a second.
  - **Receiver:** name and phone, both required; the phone must be a Vietnamese number. A note is optional.
  - **Payment:** "Thanh toán khi nhận hàng" is the only option. The summary shows the cart total (same rounding).
  - **"Đặt hàng":** calls `POST /api/shopping-list/checkout` with the delivery details. Toast "Đã đặt hàng"; the ordered lines leave the cart.
- In Kho, ordered items show dimmed with "Đang giao" until delivered (see inventory README).
- **Đơn hàng** (box icon in the Giỏ hàng header, `OrdersScreen.tsx`): the family's orders, newest first, with a status chip (Đã đặt, Đang giao, Đã giao, Đã hủy, Không giao được), address, items, total and "Thanh toán khi nhận hàng". "Hủy đơn" (in-app confirm) only while the order is "Đã đặt". Once a shipper takes it, the card shows "Người giao: <tên> · <số điện thoại>" (call button while "Đang giao"). Tapping an order notice in Thông báo opens this screen.
- Helpers in `orders.ts` (statuses, phone rule, address text, map page), covered by `orders.test.ts`.
- Khuyến mãi **Mua** adds to Giỏ hàng with the same snapshot (catalog product with the promotion's name).

Hidden from the UI (APIs kept in `shoppingApi.ts`): the "Lưu món để tham khảo" form, usage suggestions, "Tạo danh sách từ thực đơn", and the per-item "Đã mua" / "Sửa" / "Hoàn tất" actions.

The shopping service verifies the JWT and family membership and uses the server-side `PURCHASE_SYNC_API_KEY` for inventory; no service secret is in the app.
