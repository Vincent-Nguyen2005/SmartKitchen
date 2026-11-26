# Notifications screens

Owner: Huy. Responsibility: notification center and promotions (#61). There are no notification settings: every notification type is shown and sent.

## Screens

| File | What it does |
|---|---|
| `NotificationsHome.tsx` | Entry point of the "Thông báo" tab: one list, no title, segments or read filter |
| `NotificationFeed.tsx` | The list: notifications (paging on scroll, unread dot + bold title, tap marks read), expiry alerts from the inventory alerts API (expired or within 3 days; tap opens Kho with the item's edit dialog) and active promotions (hidden when a promotion notification exists). Expiry first, then unread, then newest. Pull-to-refresh |
| `PromotionDetail.tsx` | Promotion detail with "Mua" (adds to Giỏ hàng) |
| `registerDeviceToken.ts` | Registers the Expo push token after sign-in; never throws |

Shared by the admin screens too: `gatewayApi.ts` (API client), `useGatewayApi.ts` (session → client), `ui.tsx` (layout, states, buttons, segmented tabs, fields, badges). Colours, spacing, font sizes and the icon wrapper come from `../../theme/` (see its README).

Icons are Lucide, named imports only. Every card has the same style: a type icon (Tag, Clock, ShoppingCart, Info) or the promotion image; loading / empty / error states show an icon, and the error state has "Thử lại".

## How it talks to the backend

- Every call goes through the **gateway** (`EXPO_PUBLIC_API_BASE_URL`, the same variable and fallback as `App.tsx`: Android emulator `http://10.0.2.2:4000`, otherwise `http://localhost:4000`). Kazan's `services/api.ts` calls auth/family directly, but notification-service and admin-service only receive a trusted identity through the gateway.
- Identity comes only from `useSession()`: `user.id`, `user.role`, `accessToken` (sent as `Authorization: Bearer`). No user id or role is read from env, and the app contains no secrets.
- 10 s timeout; errors are shown in Vietnamese (`errorMessage()`): network, 401 (session expired), 403, 429, 5xx.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | no | Gateway base URL (defaults above). On a real phone use your PC's LAN IP, e.g. `http://192.168.1.10:4000` |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | no | Expo/EAS project id, needed to get a push token. Without it, push registration is skipped silently. Not a secret |

## Push token registration

`App.tsx` calls `registerDeviceToken()` once per signed-in user. It is skipped (no error shown) on web, without `EXPO_PUBLIC_EAS_PROJECT_ID`, when the user denies permission, or when the native module is missing (`expo-notifications` is loaded lazily). Expo Go on Android cannot receive remote push since SDK 53, so use a development build for real push.

## Manual test steps (no test runner in apps/mobile)

Preparation: `docker compose -p smartkitchen up -d`, then in `apps/mobile` run `pnpm dev` (or `npx expo start`). Sign in with a verified account.

1. **Inbox empty state:** new account → "Bạn chưa có thông báo nào."
2. **Inbox data:** as admin, resolve a report filed by this user (admin screens), or dispatch a promotion → pull to refresh → the new item is highlighted (unread dot).
3. **Mark as read:** tap the item → the highlight disappears; reopen the app → it stays read.
4. **Unread filter:** "Chưa đọc (n)" shows only unread items.
5. **Paging:** with more than 20 notifications, scrolling to the end loads the next page.
6. **Error + retry:** stop the gateway (`docker compose -p smartkitchen stop gateway`) → pull to refresh → "Không kết nối được máy chủ…" → start it → "Thử lại" works.
7. **Promotions search:** type `ca chua` (no accents) → promotions titled "Cà chua…" appear; an unknown word → the empty state names it.
8. **No settings:** Hồ sơ has no "Cài đặt thông báo" row; promotions, expiry alerts and "Tuần này còn thiếu" always show.
9. **Push registration (dev build):** allow notifications → `device_tokens` has a row for the user; deny → app keeps working.
10. **Responsive:** on a wide window or tablet → inbox shows 2 columns, promotions 2–3 columns (a lone last card keeps the column width). Native builds are portrait-locked by `app.config.ts`, so check landscape on web (`pnpm --filter mobile exec expo start --web`) or a tablet.
11. **Accessibility:** with TalkBack/VoiceOver, every card reads its title and unread state; switches and buttons have labels.

## "Tuần này còn thiếu" and "Cần mua tuần này"

- **The item:** Thông báo shows one entry at the top, "Tuần này còn thiếu N nguyên liệu", when menu-service's `GET /api/menus/week-missing` returns N > 0. There's no entry when N = 0 or the check fails. It's computed on every load, with no push and no duplicates.
- **The screen:** tapping it opens `WeekShoppingScreen`, a ProductCard grid with image, name and ONE line: the missing amount in the product's sale unit ("Thiếu 6 kg", "Thiếu 2 gói", "Thiếu 20 quả"). There is no separate "Mua …" line (labels in `weekShopping.ts`).
  - Items not sold in Đi chợ say "Chưa có bán"; sold items with no known conversion keep their recipe unit ("Thiếu 3 cái") and say "Chưa đổi được sang đơn vị bán" ("Kho có nhưng khác đơn vị" when Kho has it in another measure). Neither is added.
  - "Thêm vào Giỏ hàng" calls `POST /api/shopping-list/items/ensure` with exactly the shown amounts (an existing cart line is raised to at least that, never doubled), then opens Đi chợ on Giỏ hàng.
- **Promotions without an image:** shown with the neutral tag icon instead of the broken-image icon.
