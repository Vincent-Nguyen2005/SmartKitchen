# Inventory screen (Khanh)

Inventory and capture requests go through `EXPO_PUBLIC_API_BASE_URL` with the bearer token and family from `useSession()`. Copy `apps/mobile/.env.example` to `apps/mobile/.env` before starting Expo. The default is `http://10.0.2.2:4000` on Android emulator and `http://localhost:4000` elsewhere. For a physical device, set the gateway URL to the computer's LAN IP, e.g. `http://192.168.1.10:4000`.

- The bottom bar's **QR gia đình** action is about families, not Kho: the family owner sees a one-time join QR (revoked when the sheet closes, 10 minutes at most); everyone else scans one to join (`src/screens/family/familyQr.ts`). Receipt QR scanning was removed.
- **Chụp ảnh** (market items without a barcode) is camera-only: it opens the in-app camera directly on iOS/Android, and on web a file input with `accept="image/*" capture="environment"`. There is no photo-library or "no photo" path. A denied permission shows "Cần quyền camera để chụp sản phẩm" with **Mở cài đặt**; cancelling the camera closes without saving. After capture: photo (tap to retake), Tên*, Khối lượng* (number + unit), Hạn sử dụng (dd/mm/yyyy), Lưu. The item is saved first, then the photo (resized on the device to 1280 px) is uploaded, with a retry if that fails. After capture the photo is also sent once to `POST /api/inventory/photo/suggest`, which isn't stored:
  - **While it's checking:** Tên shows "Đang nhận diện...".
  - **When it's sure** (server `autofill`): Tên is prefilled with the top catalog name (unit, expiry and group filled as for a typed catalog pick), unless the user already typed. The other suggestions appear as chips under Tên.
  - **When it's not sure:** Tên stays empty. All suggestions (up to 3) appear as chips, and a tap fills Tên. The hint says "Chọn gợi ý hoặc nhập tên nguyên liệu".
  - **No suggestion or an error:** only that hint shows, and there's no popup. The captured photo stays in the preview and is stored on save when the typed name has no catalog match. The name is always editable, and saving never waits for recognition.
- Receipt images (the "Mã vạch / hóa đơn" tab of the capture sheet) are selected or captured with `expo-image-picker` and sent as base64 to inventory-service for OCR. OCR candidates remain editable drafts; users select and review items before saving. If a multi-item save fails partway through, successfully saved drafts are removed and unsaved drafts remain for retry.
- There is no voice entry (removed together with `expo-speech-recognition`); the capture bar's third button is "Chi tiêu" (see `src/screens/spending`).
- No capture mode saves automatically. Users confirm each photo item or the selected receipt drafts before creating inventory records. Inventory API, family membership or network errors leave unsaved drafts available for retry.
- **Same product, one image:** while typing or after picking a suggestion, a name that matches a catalog product (server rule, `GET /items/match`) shows the product's catalog image in the preview. That item is then saved with `productId` and the captured photo isn't uploaded; Kho shows the catalog image. With no catalog match, the captured photo is uploaded as before.
- **Already in Kho:** when the family already has the same product in the same unit, the in-app ConfirmDialog asks "Kho đã có <Tên> (<số lượng> <đơn vị>). Cộng thêm vào?".
  - "Cộng thêm" adds the quantity to that row on the server, and the row keeps its image.
  - "Thêm riêng" creates a new row, for example for a batch with a different expiry.
  - Tapping outside closes the dialog without saving.
  - A different unit simply creates a new row.
  - This applies to every add in this panel: photo, typed and receipt drafts.
- **Catalog image fallback (`catalogImages.ts`):** an item without its own photo shows the matching catalog product image.
  - **Matching:** the stored `productId` (items bought from Giỏ hàng) first, else the name, accent- and case-insensitive (`normalizeVi`).
  - **Loading:** the catalog list is read from `GET /api/admin/catalog/ingredients` and cached for 10 minutes.
  - **Family photos:** a photo the family took always wins. The fallback is display only: it's never uploaded, "Xóa ảnh" appears only for the family's photo, and deleting that photo brings the fallback back.
- The list and capture panel adapt spacing and item-card sizing for narrow phones, and content is centered with a readable maximum width on tablets. Category/unit choices remain horizontally scrollable; status and selection controls expose accessibility labels/state.

The app config includes camera and photo-library permission descriptions only; the microphone permission is turned off (`expo-image-picker` `microphonePermission: false`, photos only, no voice input).

Run the app's static typecheck with `pnpm --filter mobile typecheck`.

## Item sheet (auto-save)

Tapping a Kho item opens its sheet. There are no "Hủy" / "Lưu thay đổi" buttons; it closes with ✕, a tap outside, or Android back.
- **Bought items:** changing "Vị trí bảo quản" saves at once.
- **Manual items:** text fields save 600 ms after you stop typing and when a field loses focus; dropdowns save at once. Closing saves anything pending first.
- **Feedback:** "Đang lưu…" / "Đã lưu" under the title. A validation or server error shows at its field (or under the title), keeps the input, and keeps the sheet open, including on close.
- **No wasted requests:** an unchanged value is never sent, and only one save runs at a time. The Kho list updates after each save.
- Helpers: `services/autoSave.ts` (debounce / flush / errors) and `itemForm.ts` (validation), both tested.
