# Inventory screen (Khanh)

Inventory and capture requests go through `EXPO_PUBLIC_API_BASE_URL` with the bearer token and family from `useSession()`. Copy `apps/mobile/.env.example` to `apps/mobile/.env` before starting Expo. The default is `http://10.0.2.2:4000` on Android emulator and `http://localhost:4000` elsewhere. For a physical device, set the gateway URL to the computer's LAN IP, e.g. `http://192.168.1.10:4000`.

- Barcode scanning uses `expo-camera` on iOS, Android and supported browsers with camera access. The screen scans EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39 and ITF-14; if camera permission is denied or scanning is unavailable, enter the 8–14 digit barcode manually. Open Food Facts data is only a suggestion; users review it before saving.
- Receipt images are selected or captured with `expo-image-picker` and sent as base64 JPEG to inventory-service for OCR. OCR candidates remain editable drafts; each line must be confirmed separately. A blurry or unsupported receipt can be entered manually.
- Voice entry uses `expo-speech-recognition` in Vietnamese (`vi-VN`) with on-device recognition required. It needs an iOS or Android development build and a device with an offline Vietnamese model; browser/Expo Go builds may use the manual fallback. Audio is not persisted or sent by this screen.
- All capture modes save only after the user presses **Xác nhận và thêm vào kho**. Inventory API, family membership or network errors leave the draft available for retry.
- The list and capture panel adapt spacing and item-card sizing for narrow phones, and content is centered with a readable maximum width on tablets. Category/unit choices remain horizontally scrollable; status and selection controls expose accessibility labels/state.

The app config includes camera, photo-library and microphone/speech permission descriptions. Because `expo-speech-recognition` is a native module, create a new Expo development build after installing it; Expo Go does not include this module. The screen dynamically loads speech support and keeps manual entry available when it is missing.

Run the app's static typecheck with `pnpm --filter mobile typecheck`.
