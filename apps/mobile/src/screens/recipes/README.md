# Recipe Screens

Owner: Cuong. Responsibility: recipe browsing, creation, and editing screens.

## Nấu ăn

- **Nấu ăn tab** (`RecipeScreen`, tab key `recipes`): the shared SearchBar plus the shared card grid, with image, name, total time and "N phần". Hidden dishes are left out (`active=true`).
- **`RecipeDetail`:** image, ingredients with quantities and short units, steps with their times, total time, and "Bắt đầu nấu".
- **`CookingMode`:** one step at a time, the ingredients to add now, and a countdown for timed steps (Bắt đầu / Tạm dừng / Tiếp tục, +30 giây, Bước trước / Bước sau). Thực đơn › Theo ngày opens it too, from "Nấu món này".
- **Timer:** stores its end timestamp, so it stays correct after backgrounding or a screen lock.
- **When a timer ends:** the phone vibrates (React Native `Vibration`) and an alert shows. A local notification with sound is scheduled for the end time (expo-notifications, loaded lazily), so it also sounds in the background.
- **Screen:** stays awake while cooking (expo-keep-awake, which ships with expo).
- **Leaving:** asks for confirmation while a timer runs.

## Nấu ăn = today's menu (current)

- **Gia vị:** the recipe detail (both modes) lists seasonings in their own "Gia vị" section under "Nguyên liệu", with free-text amounts such as "vừa ăn". Cooking mode shows the seasonings used in the current step. Seasonings never count as missing.
- **Tab group order:** Nấu ăn, Dinh dưỡng, Lịch. Tapping the group from another tab opens Nấu ăn; tapping it again opens the dropdown.

- **Meal tabs:** "Bữa sáng | Bữa trưa | Bữa tối" (the shared `SegmentTabs`, the same control as Lịch's Theo ngày / Theo tuần / Theo tháng), defaulting to Bữa sáng. Only the selected meal's dishes show, and an empty meal shows "Bữa này chưa có món." A swap keeps the selected tab.

- **Confirmations** (the card's "Đổi món khác" and Lịch's "Làm mới theo kho") use the in-app `useConfirm` dialog (`components/ConfirmDialog.tsx`), not `Alert.alert` or `window.confirm`, so they work on web and on phones.
- **Swap feedback:** a spinner on the card while it works, then a toast: "Đã đổi món", "Không tìm được món khác phù hợp cho bữa này", or the server's error.

- **No search:** Nấu ăn shows only today's Lịch menu (Bữa sáng, Bữa trưa, Bữa tối).
- **Swap button:** each card has a round "Đổi món khác" button. After a confirmation the server replaces that dish (same meal and role), and the card shows a spinner while it works.
- **Detail (`mode="cook"`):** ingredients, steps and "Bắt đầu nấu". AI dishes also keep "Lưu món" and "Thêm phần thiếu vào giỏ hàng". Lịch opens the same detail with `mode="view"`: image, name, time, servings, description and ingredients only.

## Earlier notes

- **Today's menu:** Nấu ăn shows today's menu from Lịch (Bữa sáng, Bữa trưa, Bữa tối, same dishes and order). It's loaded each time the tab opens, and generated once if today has none. AI dishes appear only when they were placed in the menu, with the "AI" pill.
- **Search:** typing searches all active dishes and the family's saved AI dishes; clearing it returns to today's menu.

## Nấu ăn grouped by meal (earlier version)

- **Sections:** Bữa sáng, Bữa trưa, Bữa tối, then Món khác for dishes with no meal type. A dish with several meal types appears in each matching section.
- **AI dishes:** AI suggestions (by their `mealType`: sang / trua / toi) and saved AI dishes join those sections with an "AI" pill. The disclaimer shows once at the top whenever an AI dish is visible.
- **Search and empty states:** search filters every section, empty sections are hidden, and the shared EmptyState shows when nothing matches.

## Món gợi ý từ Kho (earlier notes; now merged into the meal sections)

- **Where:** `AiSuggestions.tsx` is shown in Thực đơn › Theo ngày and in Nấu ăn (Nấu ăn also lists "Món AI đã lưu"). There's no button: it loads `GET /api/menus/ai-suggestions` whenever the tab opens, so a Kho change made in the app shows up when you come back.
- **While generating:** it shows "Đang chuẩn bị gợi ý..." and polls every 10 s for up to 2 minutes.
- **Hidden** when the server says `not_configured` or `empty_kho`.
- **Cards** use the shared ProductCard. Opening one shows the detail with "Nấu món này" (cooking mode), "Lưu món" and "Thêm phần thiếu vào giỏ hàng".
- **Disclaimer**, always shown: "Công thức do AI gợi ý, hãy kiểm tra độ chín trước khi ăn."
