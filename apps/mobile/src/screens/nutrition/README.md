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
  - **Giới tính:** two tiles (`GenderTiles`, shared with onboarding) with ♂ / ♀ and a small "Nam" / "Nữ" caption; selected = theme primary.
  - **Activity:** no section. New profiles send `activityLevel: "LIGHTLY_ACTIVE"`; existing profiles keep their stored value.
  - **Dị ứng / Tình trạng sức khỏe:** shown one at a time with the shared `SegmentTabs` (default Dị ứng; switching keeps unsaved tags), each a `TagInput` with catalog autocomplete and free text. Catalog names are saved as selections, anything else as the user's own items.
  - **Saving:** one "Lưu" saves the basic info first, then the tags, and shows a single toast with the result or the first error.
  - **Ngày sinh picker:** the in-app `CalendarPicker` (same on web, iOS and Android, also inside embedded web previews). Day grid (‹ Tháng N YYYY ›); tapping the year opens a small year dropdown over the grid (the same month in the picked year, clamped to min/max); while empty it opens at January of (current year - 25). No helper text under the field; the age shows once a date is picked. YYYY-MM-DD is still sent.
  - Closing the form reloads the targets.
- **`profileFields.ts`:** the shared rules for both the form and the wizard (ranges, decimal parsing, age from the birth date, validation messages).
- **`OnboardingWizard`, "Thông tin cơ bản" after sign-in:**
  - Shown after a real sign-in or OTP verification, not after reopening the app with a saved session. Only for non-admin users without a profile; users who have one, or whose profile check fails, go straight to the app.
  - One question per screen with "Bước n/4": Giới tính (tapping moves on), Ngày sinh (large DateField with the age), Chiều cao and Cân nặng (large auto-focused decimal inputs).
  - Then optional Dị ứng / Tình trạng sức khỏe ("Bỏ qua" / "Tiếp"), then a summary whose rows jump back to edit. "Hoàn tất" saves the profile and the tags.
  - "Để sau" (top right) leaves without saving; the wizard comes back at the next sign-in while there is no profile.
- **`nutritionToday.ts`:** `vnToday`, building one serving (`servingOf`: missing macros count as 0), `logServing`, and the names logged today ("Đã ăn" on Nấu ăn cards).
- **Removed from the mobile app:** the segment row, Nhật ký (`MealDiaryScreen`), Thống kê (`NutritionStatsScreen`), Gợi ý (`SuggestionsScreen`, `suggestionsApi`), `DaySwitcher` and `ProfileMissingCard`. The backend routes are unchanged.
