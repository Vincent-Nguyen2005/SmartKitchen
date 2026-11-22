# Meal Diary Screens

Owner: Hung. Responsibility: daily meal logging and history screens.

There is no diary screen any more; the Nhật ký screen was removed and the meal-diary-service routes are unchanged. `mealDiaryApi.ts` is still used:

- **Logging:** Nấu ăn counts one serving when cooking mode ends with "Hoàn thành" (`logMeal`, Vietnam date).
- **Reading:** the Dinh dưỡng screen lists today's dishes (`getHistory`).
- **Removing:** "Bỏ" on the Dinh dưỡng screen deletes one logged dish (`deleteMeal`).
