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
