# Inventory screen (Khanh)

Inventory and capture requests go through `EXPO_PUBLIC_API_BASE_URL` with the bearer token and family from `useSession()`. Copy `apps/mobile/.env.example` to `apps/mobile/.env` before starting Expo. The default is `http://10.0.2.2:4000` on Android emulator and `http://localhost:4000` elsewhere. For a physical device, set the gateway URL to the computer's LAN IP, e.g. `http://192.168.1.10:4000`.

- The persistent **QR hóa đơn** action opens a dedicated QR-only camera (`expo-camera`). Only QR payloads containing a structured JSON `items` or `products` array with a product `name`, positive `quantity` and optional supported `unit` can directly produce editable item drafts. A QR containing only a payment reference or invoice URL cannot reveal line items; the app does not fetch arbitrary URLs or fabricate products. In that case, photograph or choose the printed bill instead.
- **Chụp ảnh** (market items without a barcode) is camera-only: it opens the in-app camera directly on iOS/Android, and on web a file input with `accept="image/*" capture="environment"`. There is no photo-library or "no photo" path. A denied permission shows "Cần quyền camera để chụp sản phẩm" with **Mở cài đặt**; cancelling the camera closes without saving. After capture: photo (tap to retake), Tên*, Khối lượng* (number + unit), Hạn sử dụng (dd/mm/yyyy), Lưu. The item is saved first, then the photo (resized on the device to 1280 px) is uploaded, with a retry if that fails. After capture the photo is also sent once to `POST /api/inventory/photo/suggest`, which isn't stored:
  - **While it's checking:** Tên shows "Đang nhận diện...".
  - **When it answers:** Tên is prefilled with the top catalog name (unit, expiry and group filled as for a typed catalog pick), unless the user already typed. The other suggestions appear as chips under Tên. The name is always editable.
  - **No suggestion or an error:** Tên stays empty with a small muted hint, and there's no popup. Saving never waits for recognition.
- Receipt images are selected or captured with `expo-image-picker` and sent as base64 to inventory-service for OCR. Both QR and OCR candidates remain editable drafts; users select and review items before saving. If a multi-item save fails partway through, successfully saved drafts are removed and unsaved drafts remain for retry.
- Voice entry uses `expo-speech-recognition` in Vietnamese (`vi-VN`) with on-device recognition required. It needs an iOS or Android development build and a device with an offline Vietnamese model; browser/Expo Go builds may use the manual fallback. Audio is not persisted or sent by this screen.
- No capture mode saves automatically. Users confirm each photo/voice item or the selected receipt drafts before creating inventory records. Inventory API, family membership or network errors leave unsaved drafts available for retry.
- **Catalog image fallback (`catalogImages.ts`):** an item without its own photo shows the matching catalog product image.
  - **Matching:** the stored `productId` (items bought from Giỏ hàng) first, else the name, accent- and case-insensitive (`normalizeVi`).
  - **Loading:** the catalog list is read from `GET /api/admin/catalog/ingredients` and cached for 10 minutes.
  - **Family photos:** a photo the family took always wins. The fallback is display only: it's never uploaded, "Xóa ảnh" appears only for the family's photo, and deleting that photo brings the fallback back.
- The list and capture panel adapt spacing and item-card sizing for narrow phones, and content is centered with a readable maximum width on tablets. Category/unit choices remain horizontally scrollable; status and selection controls expose accessibility labels/state.

The app config includes camera, photo-library and microphone/speech permission descriptions. Because `expo-speech-recognition` is a native module, create a new Expo development build after installing it; Expo Go does not include this module. The screen dynamically loads speech support and keeps manual entry available when it is missing.

Run the app's static typecheck with `pnpm --filter mobile typecheck`.
