# Nutrition Screens

Owner: Hung. Responsibility: nutrition summaries and dietary tracking screens.

- **`NutritionHome`, the Dinh dưỡng tab ("Dinh dưỡng trong ngày"):**
  - Today's calories eaten against the target, and bars for Đạm, Tinh bột and Chất béo ("eaten / target g"). The data comes from nutrition-service `GET /api/nutrition/daily-stats?date=` (Vietnam date); the targets come from the profile.
  - Below that, the dishes counted today, each with "Bỏ" to un-log it.
  - **No profile (404):** the same screen with today's totals from the meal diary against default targets (2000 kcal, protein 100 g, carbs 250 g, fat 67 g) and the caption "Mục tiêu ước tính". There is no link or button to the profile.
  - **Nothing logged yet:** the bars at 0 and the hint "Nấu xong một món ở Nấu ăn để tính vào hôm nay".
- **`NutritionProfileScreen`, the health profile form (Hồ sơ › "Thông tin sức khỏe"):**
  - **Ngày sinh:** uses the shared DateField (dd/mm/yyyy, 01/01/1900 to today) and shows the age next to it. The form sends `birthDate`, and nutrition-service stores it and computes the age. Profiles saved before this have only an age, so they are shown with the birth date that gives that age today.
  - **Chiều cao / Cân nặng:** decimal inputs ("," becomes ".", at most 2 decimals, placeholder "0.00"), with inline errors outside 50–250 cm and 2–300 kg.
  - **Activity:** no section. New profiles send `activityLevel: "LIGHTLY_ACTIVE"`; existing profiles keep their stored value.
  - **Dị ứng / Bệnh lý:** the shared `TagInput` with autocomplete from the nutrition-service catalogs. Free text is allowed: catalog names are saved as selections, and anything else as the user's own items (shown again later, not used for suggestions).
  - Closing the form reloads the targets.
- **`nutritionToday.ts`:** `vnToday`, building one serving (`servingOf`: missing macros count as 0), `logServing`, and the names logged today ("Đã ăn" on Nấu ăn cards).
- **Removed from the mobile app:** the segment row, Nhật ký (`MealDiaryScreen`), Thống kê (`NutritionStatsScreen`), Gợi ý (`SuggestionsScreen`, `suggestionsApi`), `DaySwitcher` and `ProfileMissingCard`. The backend routes are unchanged.
