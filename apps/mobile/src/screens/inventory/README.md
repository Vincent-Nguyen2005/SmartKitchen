# Inventory screen (Khanh)

Inventory and capture requests go through `EXPO_PUBLIC_API_BASE_URL` with the bearer token and family from `useSession()`. Copy `apps/mobile/.env.example` to `apps/mobile/.env` before starting Expo. The default is `http://10.0.2.2:4000` on Android emulator and `http://localhost:4000` elsewhere. For a physical device, set the gateway URL to the computer's LAN IP, e.g. `http://192.168.1.10:4000`.

- The persistent **QR hóa đơn** action opens a dedicated QR-only camera (`expo-camera`). Only QR payloads containing a structured JSON `items` or `products` array with a product `name`, positive `quantity` and optional supported `unit` can directly produce editable item drafts. A QR containing only a payment reference or invoice URL cannot reveal line items; the app does not fetch arbitrary URLs or fabricate products. In that case, photograph or choose the printed bill instead.
- Receipt images are selected or captured with `expo-image-picker` and sent as base64 to inventory-service for OCR. Both QR and OCR candidates remain editable drafts; users select and review items before saving. If a multi-item save fails partway through, successfully saved drafts are removed and unsaved drafts remain for retry.
- Voice entry uses `expo-speech-recognition` in Vietnamese (`vi-VN`) with on-device recognition required. It needs an iOS or Android development build and a device with an offline Vietnamese model; browser/Expo Go builds may use the manual fallback. Audio is not persisted or sent by this screen.
- No capture mode saves automatically. Users confirm each photo/voice item or the selected receipt drafts before creating inventory records. Inventory API, family membership or network errors leave unsaved drafts available for retry.
- The list and capture panel adapt spacing and item-card sizing for narrow phones, and content is centered with a readable maximum width on tablets. Category/unit choices remain horizontally scrollable; status and selection controls expose accessibility labels/state.

The app config includes camera, photo-library and microphone/speech permission descriptions. Because `expo-speech-recognition` is a native module, create a new Expo development build after installing it; Expo Go does not include this module. The screen dynamically loads speech support and keeps manual entry available when it is missing.

Run the app's static typecheck with `pnpm --filter mobile typecheck`.
