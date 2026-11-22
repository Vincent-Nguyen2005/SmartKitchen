# Nutrition Screens

Owner: Hung. Responsibility: nutrition summaries and dietary tracking screens.

- **`NutritionHome`, the Dinh dưỡng tab ("Dinh dưỡng trong ngày"):**
  - Today's calories eaten against the target, and bars for Đạm, Tinh bột and Chất béo ("eaten / target g"). The data comes from nutrition-service `GET /api/nutrition/daily-stats?date=` (Vietnam date); the targets come from the profile.
  - Below that, the dishes counted today, each with "Bỏ" to un-log it.
  - **No profile (404):** an EmptyState plus a button to Hồ sơ › Thông tin sức khỏe.
  - **Nothing logged yet:** the bars at 0 and the hint "Nấu xong một món ở Nấu ăn để tính vào hôm nay".
- **`NutritionProfileScreen`, the health profile form:** height, weight, birth year, gender, activity, goal, allergies and conditions, using the same API and validation. It opens from Hồ sơ › "Thông tin sức khỏe" with a back button; closing it reloads the targets.
- **`nutritionToday.ts`:** `vnToday`, building one serving (`servingOf`: missing macros count as 0), `logServing`, and the names logged today ("Đã ăn" on Nấu ăn cards).
- **Removed from the mobile app:** the segment row, Nhật ký (`MealDiaryScreen`), Thống kê (`NutritionStatsScreen`), Gợi ý (`SuggestionsScreen`, `suggestionsApi`), `DaySwitcher` and `ProfileMissingCard`. The backend routes are unchanged.
