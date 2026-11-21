# Menu Screens

Owner: Cuong. Responsibility: meal menu planning and schedule screens.

## Lịch (tab key `menu`)

- **Theo ngày:** Bữa sáng, Bữa trưa and Bữa tối are section titles. Each dish uses the shared card (image, name, kcal, total time), and tapping it opens the same recipe detail as Nấu ăn, with "Bắt đầu nấu". The small refresh icon next to the date switcher is "Làm mới theo kho".
- **Stale menu:** menu-service stores the Kho snapshot hash on each generated menu. When today's menu is open, the app compares that with `GET /api/menu/kho-hash`. If they differ, or it's an older generated menu with no hash, it regenerates today's menu once per Kho state. It never does this for past or future days.
- The notes below describe the earlier layout; the week and month views are unchanged.

## Thực đơn (earlier notes)

- **Theo tuần:** a timetable. Rows are Bữa sáng/trưa/tối, columns are T2..CN with dd/mm, and today is highlighted. Day columns scroll sideways on narrow phones while the row labels stay fixed.
- **Theo tháng:** a month grid with up to 3 dish names per day, or "N món" when the cell is narrow.
- **Opening a day:** tapping a cell, a day header or a month day opens Theo ngày for that date. Each view loads its menus with one `GET /api/menu?from&to` request. "Làm mới theo kho" appears in Theo ngày only.
- **Controls:** Theo ngày / Theo tuần / Theo tháng plus the date switcher.
- **Auto-suggest:** opening today with no menu suggests dishes from Kho automatically, once per family and day per app session. If that request fails, it is not retried.
- **"Làm mới theo kho":** suggests again for the shown period and replaces that period's menu (`POST /api/menu/generate` with `familyId`).
- **Dish cards:** each card shows the image (placeholder for now), name, meal, "Có sẵn X/Y nguyên liệu", the reason and the missing ingredients.
- **"Thêm phần thiếu vào giỏ hàng":** adds the missing ingredients to Giỏ hàng through `addToCart`. It uses the catalog price when the product's unit fits, and the server merges duplicates.
