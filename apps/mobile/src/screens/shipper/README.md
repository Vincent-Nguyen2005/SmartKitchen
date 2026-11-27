# Shipper app

Accounts with the `SHIPPER` role (created by an admin in Quản trị › Người giao hàng) see only this shell (`App.tsx` + `navigation/appShell.ts`): no Kho, Đi chợ, Nấu ăn, Gia đình, capture bar, onboarding or health wizard.

| File | What it does |
|---|---|
| `ShipperHome.tsx` | Header (name, Đăng xuất) and three tabs. **Đơn chờ**: waiting orders, nearest first when the phone's location is allowed, else oldest first; refreshed every 30 s while shown. **Đang giao**: mine. **Lịch sử**: mine, delivered or failed, last 30 days. Cards show short address, distance, item count, "Thu 675.000đ" and the order time. Pull-to-refresh, skeletons, empty and error states |
| `ShipperOrderDetail.tsx` | Map with the pin (OpenStreetMap in a WebView), full address with "Chỉ đường" (geo: / Apple Maps / Google Maps link), receiver with "Gọi" (tel:), note, the receipt (quantity with unit word, unit price after discount, original price struck through, line total) and "Tổng tiền cần thu". Actions: "Nhận đơn" (shows "Đơn đã có người nhận" when someone was faster), "Đã giao" with "Xác nhận đã giao và thu …?", "Không giao được" with a reason (Không liên lạc được / Sai địa chỉ / Khách từ chối nhận / Khác + text) |
| `shipper.ts` | Types and pure helpers (texts, distance, links, map page), covered by `shipper.test.ts` |
| `shipperApi.ts` | shopping-list-service `/api/shopping-list/shipper/orders*` |

A locked account is refused by the server (403) and can no longer sign in ("Tài khoản đã bị khóa").
