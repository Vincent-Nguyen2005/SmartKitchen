# Native Android integration

These files provide the Jetpack Compose version of the Nutrition Profile flow. The current `apps/mobile` project is Expo/React Native and has no Gradle Android application, so this source is kept separate for integration into a native Android host.

Add the following dependencies to the Android app module (use versions compatible with the host app's Compose BOM and lifecycle setup):

```kotlin
implementation(platform("androidx.compose:compose-bom:<compose-bom-version>"))
implementation("androidx.compose.material3:material3")
implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:<lifecycle-version>")
implementation("androidx.lifecycle:lifecycle-runtime-compose:<lifecycle-version>")
implementation("com.squareup.retrofit2:retrofit:<retrofit-version>")
implementation("com.squareup.retrofit2:converter-gson:<retrofit-version>")
```

Create Retrofit with the gateway URL ending in `/`, build `NutritionProfileApi`, then provide `NutritionProfileViewModel(api, authenticatedUserId)` through the app's ViewModel factory or dependency-injection framework. Render `NutritionProfileScreen(viewModel)` from the host navigation graph. On Android Emulator, the host machine is typically reachable at `http://10.0.2.2:4000/`; use the appropriate LAN address for a physical device.

The sample sends `X-User-Id` for the service contract. Production deployments must authenticate the request at the gateway and overwrite this header from verified credentials; never rely on an arbitrary client-provided user ID for authorization.
