# Nutrition Screens

Owner: Hung. Responsibility: nutrition summaries and dietary tracking screens.

- **`NutritionHome`, the Dinh dưỡng tab ("Dinh dưỡng trong ngày"):**
  - Today's calories eaten against the target, and bars for Đạm, Tinh bột and Chất béo ("eaten / target g"). The data comes from nutrition-service `GET /api/nutrition/daily-stats?date=` (Vietnam date); the targets come from the profile.
  - Below that, the dishes counted today, each with "Bỏ" to un-log it.
  - **No profile (404):** the same screen with today's totals from the meal diary against default targets (2000 kcal with the nutrition-service split 20 / 55 / 25: protein 100 g, carbs 275 g, fat 56 g) and the caption "Mục tiêu ước tính". There is no link or button to the profile.
  - **Nothing logged yet:** the bars at 0 and the hint "Nấu xong một món ở Nấu ăn để tính vào hôm nay".
- **`NutritionProfileScreen`, the health profile form (Hồ sơ › "Thông tin sức khỏe"):**
  - **Ngày sinh:** uses the shared DateField (dd/mm/yyyy, 01/01/1900 to today) and shows the age next to it. The form sends `birthDate`, and nutrition-service stores it and computes the age. Profiles saved before this have only an age, so they are shown with the birth date that gives that age today.
  - **Chiều cao / Cân nặng:** decimal inputs ("," becomes ".", at most 2 decimals). Height is entered in meters (unit "m", placeholder "1.70", 0.50–2.50 m) with the reading "1m70" under a valid value (Hồ sơ only); it is still stored and sent in cm (m x 100, 1 decimal) and existing profiles are shown in meters. Weight in kg, 2–300.
  - **Giới tính:** two tiles (`GenderTiles`, shared with onboarding) with the lucide Mars / Venus icons (about 44 px, stroke 2.5) and a small "Nam" / "Nữ" caption; selected = theme primary.
  - **Activity:** no section. New profiles send `activityLevel: "LIGHTLY_ACTIVE"`; existing profiles keep their stored value.
  - **Dị ứng / Tình trạng sức khỏe:** shown one at a time with the shared `SegmentTabs` (default Dị ứng; switching keeps unsaved tags), each a `TagInput` with catalog autocomplete and free text. Catalog names are saved as selections, anything else as the user's own items.
  - **Saving:** there is no "Lưu" button. Leaving the screen (back arrow ‹, Android back, closing) saves.
    - Nothing changed: it just closes.
    - Valid: it saves the changed parts (basic info, then the tags) and closes, and the previous screen shows "Đã lưu thông tin sức khỏe".
    - Invalid basic info: the in-app dialog "Thông tin chưa hợp lệ. Thoát mà không lưu?" (Ở lại / Thoát).
    - Save failed: the screen stays open with the error.
    - Tags alone can be saved without filling in the basic info. The onboarding wizard keeps its own "Hoàn tất".
  - **Giới tính:** compact tiles (about the height of a text input) with a 24 px Mars / Venus icon and "Nam" / "Nữ" beside it; the same tiles in onboarding.
  - **Ngày sinh picker:** the in-app `CalendarPicker` (same on web, iOS and Android, also inside embedded web previews). Day grid (‹ Tháng N YYYY ›); tapping the year opens a small year dropdown over the grid (the same month in the picked year, clamped to min/max); while empty it opens at January of (current year - 25). No helper text under the field; the age shows once a date is picked. YYYY-MM-DD is still sent.
  - Closing the form reloads the targets.
- **`profileFields.ts`:** the shared rules for both the form and the wizard (ranges, decimal parsing, age from the birth date, validation messages).
- **`OnboardingWizard`, "Thông tin cơ bản" after sign-in:**
  - Shown after a real sign-in or OTP verification, not after reopening the app with a saved session. Only for non-admin users without a profile; users who have one, or whose profile check fails, go straight to the app.
  - One question per screen with "Bước n/6": Giới tính (tapping moves on), Ngày sinh (large DateField without its label, no age text), Chiều cao in m and Cân nặng in kg (normal-size auto-focused decimal inputs with the unit inside on the right, no reading under them). The summary shows the height as "1m70".
  - Then two optional steps: "Bạn có dị ứng gì không?" and "Tình trạng sức khỏe của bạn?", each a TagInput (no tabs; catalog autocomplete and free text). "Bỏ qua" drops what was added on that step; "Tiếp" keeps it. Then a summary with separate rows for Dị ứng and Tình trạng sức khỏe; every row jumps back to edit. "Hoàn tất" saves the profile and the tags.
  - "Để sau" (top right) leaves without saving; the wizard comes back at the next sign-in while there is no profile.
- **`nutritionToday.ts`:** `vnToday`, building one serving (`servingOf`: missing macros count as 0), `logServing`, and the names logged today ("Đã ăn" on Nấu ăn cards).
- **Removed from the mobile app:** the segment row, Nhật ký (`MealDiaryScreen`), Thống kê (`NutritionStatsScreen`), Gợi ý (`SuggestionsScreen`, `suggestionsApi`), `DaySwitcher` and `ProfileMissingCard`. The backend routes are unchanged.
