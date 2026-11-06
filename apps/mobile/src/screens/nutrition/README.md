# Nutrition Screens

Owner: Hung. Responsibility: nutrition summaries and dietary tracking screens.

`NutritionProfileScreen` is the Expo/React Native implementation used by this workspace. Render it with the gateway base URL and authenticated user's UUID:

```tsx
<NutritionProfileScreen
  apiBaseUrl={API_BASE_URL}
  userId={authenticatedUser.id}
/>
```

The screen loads the profile on mount, creates it with POST on first save, updates it with PUT after that, and displays the returned TDEE. Configure `apiBaseUrl` for the device environment (for example, the host machine's LAN address when testing on a physical phone).

The Hồ sơ screen also saves selected allergies and health conditions. The
Thống kê tab calls `GET /api/nutrition/daily-stats?date=YYYY-MM-DD`; the Gợi ý
tab calls `GET /api/nutrition/suggestions`. Both require the user's UUID and an
existing nutrition profile. Macro goals use the app's existing 20/50/30
protein/carbohydrate/fat calorie split. Suggestions are filtered only by recipe
catalog tags and are not medical advice.

For a native Android app, the standalone Jetpack Compose, ViewModel, and Retrofit sources are in `apps/mobile/native-android`. Add the documented Android dependencies and provide an authenticated `NutritionProfileApi` and `NutritionProfileViewModel` from the host app's dependency-injection setup.
