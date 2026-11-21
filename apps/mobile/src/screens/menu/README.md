# Menu Screens

Owner: Cuong. Responsibility: meal menu planning and schedule screens.

## Thực đơn

- **Theo tuần:** a timetable. Rows are Bữa sáng/trưa/tối, columns are T2..CN with dd/mm, and today is highlighted. Day columns scroll sideways on narrow phones while the row labels stay fixed.
- **Theo tháng:** a month grid with up to 3 dish names per day, or "N món" when the cell is narrow.
- **Opening a day:** tapping a cell, a day header or a month day opens Theo ngày for that date. Each view loads its menus with one `GET /api/menu?from&to` request. "Làm mới theo kho" appears in Theo ngày only.
- **Controls:** Theo ngày / Theo tuần / Theo tháng plus the date switcher.
- **Auto-suggest:** opening today with no menu suggests dishes from Kho automatically, once per family and day per app session. If that request fails, it is not retried.
- **"Làm mới theo kho":** suggests again for the shown period and replaces that period's menu (`POST /api/menu/generate` with `familyId`).
- **Dish cards:** each card shows the image (placeholder for now), name, meal, "Có sẵn X/Y nguyên liệu", the reason and the missing ingredients.
- **"Thêm phần thiếu vào giỏ hàng":** adds the missing ingredients to Giỏ hàng through `addToCart`. It uses the catalog price when the product's unit fits, and the server merges duplicates.
