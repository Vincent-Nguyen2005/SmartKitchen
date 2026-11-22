# Menu Screens

Owner: Cuong. Responsibility: meal menu planning and schedule screens.

## Lịch (tab key `menu`)

- **Theo ngày:** Bữa sáng, Bữa trưa and Bữa tối are section titles. Each dish uses the shared card (image, name, kcal, total time), and tapping it opens the same recipe detail as Nấu ăn, with "Bắt đầu nấu". The small refresh icon next to the date switcher is "Làm mới theo kho".
- **Saved menus:** a day (today or later) is generated once, the first time it's opened in Lịch or Nấu ăn, then kept. It never changes by itself.
- **Cards:** Theo ngày cards show only the image and name. Tapping one opens the shared detail read-only (`mode="view"`: no steps, no cooking, no "Đổi món khác"; those are in Nấu ăn). An older single-dish menu is topped up once to "Số món mỗi bữa". The tab icon is a calendar.
- **Theo tuần:** a timetable (rows Sáng / Trưa / Tối, columns T2..CN with the day of month) that fits a 360 px phone without sideways scrolling: a narrow label column and 7 equal flexible columns. Each cell shows only the meal's dish count ("N món", like Theo tháng), or "—"; tapping a cell or a header opens Theo ngày. Opening it generates menus, in one request, for today and the later days of that week that have none.
- **"Làm mới theo kho":** regenerates the whole day after a confirmation. Past days are read-only.
- **Meal header:** each meal shows its total kcal. "Số món mỗi bữa" is in Hồ sơ.
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
