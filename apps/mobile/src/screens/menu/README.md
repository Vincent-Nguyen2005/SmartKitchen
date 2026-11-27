# Menu Screens

Owner: Cuong. Responsibility: meal menu planning and schedule screens.

## Lịch (tab key `menu`)

- **Theo ngày:** Bữa sáng, Bữa trưa and Bữa tối are section titles. Each dish uses the shared card (image, name, kcal, total time), and tapping it opens the same recipe detail as Nấu ăn, with "Bắt đầu nấu". The small refresh icon next to the date switcher is "Làm mới theo kho".
- **Saved menus:** a day (today or later) is generated once, the first time it's opened in Lịch or Nấu ăn, then kept. It never changes by itself.
- **Cards:** Theo ngày cards show only the image and name. Tapping one opens the shared detail read-only (`mode="view"`: no steps, no cooking, no "Đổi món khác"; those are in Nấu ăn). An older single-dish menu is topped up once to "Số món mỗi bữa". The tab icon is a calendar.
- **Theo tuần:** a timetable (rows Sáng / Trưa / Tối, columns T2..CN with the day of month) that fits a 360 px phone without sideways scrolling: a narrow label column and 7 equal flexible columns. Each cell shows only the meal's dish count ("N món", like Theo tháng), or "—"; tapping a cell or a header opens Theo ngày. Opening it generates menus, in one request, for today and the later days of that week that have none.
- **"Làm mới theo kho":** regenerates the whole day after a confirmation. Past days are read-only.
- **Meal header:** each meal shows its total kcal.
- **Calorie-based menus:** dishes and portions come from the family's kcal targets (menu-service `meal-plan.ts`; "Số món mỗi bữa" was removed from Hồ sơ). Amounts always follow the planned portions (`dishServings` / `scaleRecipe` in `recipes/portions.ts`). The label (`recipes/mealPortions.ts`) on the cards, the detail header and cooking mode is "Đủ cho <family size> người" for a meal with several dishes (lunch / dinner) and "<N> phần" for a single-dish meal (e.g. a one-dish breakfast); "cho N người" in the ingredient titles stays the family size.
- **"Kèm cơm trắng":** a lunch / dinner with món mặn shows this line under the meal (Lịch and Nấu ăn); the món mặn's detail shows it too and lists the meal's rice as "Gạo" (raw grams from the server), so "Hoàn thành" on the món mặn takes the rice out of Kho once per meal (with the dish's ingredients).
- **"Tạo lại tuần"** (Theo tuần, the family owner or a user without a family): regenerates today and the later days of the shown week (`generate-days` with `replace`), after a confirm (`weekRebuild.ts`).
- **Health warnings:** a dish that is unsuitable for a family member has a small "Lưu ý" pill with a warning icon on its card in Lịch and Nấu ăn. Its detail lists the warnings ("Huy: không hợp tiểu đường") and the alternative dish; tapping the alternative opens it, and in Nấu ăn it can then be cooked. These are never sent as notifications.
- **Allergies not loaded:** when a day's menu was made before the family's health data could ever be loaded (`healthUnavailable`), Lịch › Theo ngày shows "Chưa tải được thông tin dị ứng của gia đình, hãy làm mới sau". "Làm mới theo kho" later makes a menu without it.
- **Portions:** a dish opened from Lịch or Nấu ăn shows "Nguyên liệu (cho N người)" and "Gia vị (cho N người)" with quantities scaled by `recipes/portions.ts`. N is the menu's servings, else the family size. Cooking mode shows the scaled per-step amounts and "Cho N người"; step timers are unchanged. AI dishes and their "Thêm phần thiếu vào giỏ hàng" use the same amounts. Logging still counts 1 portion per member. Dishes opened outside a menu (e.g. admin) keep the recipe's own servings.
- **Family menus:** Lịch and Nấu ăn show the family's shared menu. The server resolves the family, and the UI is unchanged. "Số món mỗi bữa" is the family's setting: only the family owner can change it. Other members see the values read-only with "Chỉ chủ gia đình mới thay đổi được"; the owner sees no note, only the +/− controls. There is no description line.
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
