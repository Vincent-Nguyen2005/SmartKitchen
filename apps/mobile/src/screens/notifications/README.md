# Notifications screens

Owner: Huy. Responsibility: notification center, promotions and user notification preferences (#61).

## Screens

| File | What it does |
|---|---|
| `NotificationsHome.tsx` | Entry point of the "🔔 Thông báo" tab: Thông báo / Khuyến mãi / Cài đặt |
| `NotificationListScreen.tsx` | Inbox: paging (load more on scroll), pull-to-refresh, unread highlight + filter, tap to mark as read |
| `PromotionsScreen.tsx` | Active promotions with debounced search (accent-insensitive on the server), paging, pull-to-refresh |
| `NotificationPreferencesScreen.tsx` | Push / promotion toggles, quiet hours (HH:mm, overnight allowed), save |
| `registerDeviceToken.ts` | Registers the Expo push token after sign-in; never throws |

Shared by the admin screens too: `gatewayApi.ts` (API client), `useGatewayApi.ts` (session → client), `ui.tsx` (layout, states, buttons).

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

## Known issue: Metro bundling

On main (as of e04d0eb) `apps/mobile/metro.config.js` sets `disableHierarchicalLookup`, so Metro cannot resolve react-native's own dependencies under `node_modules/.pnpm` and every bundle fails (`Unable to resolve "invariant"`). This is pre-existing and not caused by these screens. It is fixed in `fix/mobile-metro` (pending PR); until that is merged, `tsc --noEmit` is the check for these screens.

## Manual test steps (no test runner in apps/mobile)

Preparation: `docker compose -p smartkitchen up -d`, then in `apps/mobile` run `pnpm dev` (or `npx expo start`). Sign in with a verified account.

1. **Inbox empty state:** new account → "Bạn chưa có thông báo nào."
2. **Inbox data:** as admin, resolve a report filed by this user (admin screens), or dispatch a promotion → pull to refresh → the new item is highlighted (unread dot).
3. **Mark as read:** tap the item → the highlight disappears; reopen the app → it stays read.
4. **Unread filter:** "Chưa đọc (n)" shows only unread items.
5. **Paging:** with more than 20 notifications, scrolling to the end loads the next page.
6. **Error + retry:** stop the gateway (`docker compose -p smartkitchen stop gateway`) → pull to refresh → "Không kết nối được máy chủ…" → start it → "Thử lại" works.
7. **Promotions search:** type `ca chua` (no accents) → promotions titled "Cà chua…" appear; an unknown word → the empty state names it.
8. **Preferences:** toggle Khuyến mãi off → Lưu → reopen → still off. Quiet hours `22:00`/`06:00` saves; `7:00` shows the HH:mm validation error and the save button is disabled.
9. **Push registration (dev build):** allow notifications → `device_tokens` has a row for the user; deny → app keeps working.
10. **Responsive:** rotate the phone / use a tablet → inbox shows 2 columns, promotions 2–3 columns, preferences are centred (max 640 px).
11. **Accessibility:** with TalkBack/VoiceOver, every card reads its title and unread state; switches and buttons have labels.
