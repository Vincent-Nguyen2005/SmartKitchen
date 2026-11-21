# Menu Screens

Owner: Cuong. Responsibility: meal menu planning and schedule screens.

## Thực đơn

- **Controls:** Theo ngày / Theo tuần / Theo tháng plus the date switcher.
- **Auto-suggest:** opening a day (today or later) with no menu suggests dishes from Kho automatically, once per family and day per app session. If that request fails, it is not retried.
- **"Làm mới theo kho":** suggests again for the shown period and replaces that period's menu (`POST /api/menu/generate` with `familyId`).
- **Dish cards:** each card shows the image (placeholder for now), name, meal, "Có sẵn X/Y nguyên liệu", the reason and the missing ingredients.
- **"Thêm phần thiếu vào giỏ hàng":** adds the missing ingredients to Giỏ hàng through `addToCart`. It uses the catalog price when the product's unit fits, and the server merges duplicates.
