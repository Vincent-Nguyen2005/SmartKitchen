# Admin Screens

Owner: Huy. Responsibility: administration and operational management screens (#61, backed by #48/#49/#58/#59).

## Access

- The "Quản trị" tab is rendered only when `useSession().user.role === "ADMIN"` (see `App.tsx`). `AdminHome` repeats the check and shows "Không có quyền truy cập" otherwise.
- ADMIN accounts see **only** the "Quản trị" tab (SCRUM-283); all other tabs are hidden for them, and non-admins never see it.
- This is a UI guard only. The real check is on the server: the gateway sets `x-user-role` from the verified access token and admin-service requires `ADMIN` on every admin endpoint.

## Screens

| File | What it does | API (through the gateway) |
|---|---|---|
| `AdminHome.tsx` | Tổng quan (default) / Thống kê / Báo cáo / Hệ thống / Nguyên liệu / Trọng số; small state-based stack that pushes Người dùng, Gia đình and family detail over the dashboard (back / Android back pops one level) | — |
| `AdminDashboardScreen.tsx` | "Tổng quan": cards for total users, total families and system status; 5 newest users (name, email, role badge) and 5 newest families (name, member count) side by side on tablets, stacked on phones; "Xem tất cả" opens Người dùng, "Xem tất cả →" opens Gia đình, a family row opens its detail; pull-to-refresh | `GET /api/admin/users?limit=5`, `GET /api/admin/families?limit=5`, `GET /api/admin/health-monitor/status` |
| `AdminUsersScreen.tsx` | Newest 100 users with client-side search by name or email, pull-to-refresh, "Chưa có người dùng" empty state | `GET /api/admin/users?limit=100` |
| `AdminFamiliesScreen.tsx` | Newest 100 families with client-side search by name, pull-to-refresh, empty state; a row opens its detail | `GET /api/admin/families?limit=100` |
| `AdminFamilyDetailScreen.tsx` | Family name, creation date, owner email, members (name, role in family; joined date once family-service returns `joinedAt`) | `GET /api/admin/families/:id` |
| `DashboardScreen.tsx` | "Thống kê": overview for 24h or 7d: KPI cards (overall status, services up / slow / down, open reports, reports resolved in the window), bar charts of reports by status and by category, line charts of response time (average + p95) and uptime over time with a service picker, horizontal bar chart of uptime per service (worst first). Each card has its own loading / empty / error state; pull-to-refresh | `GET /api/admin/health-monitor/status`, `/summary?window=`, `/timeseries?service=&window=`, `GET /api/admin/reports/stats?window=` |
| `ReportsScreen.tsx` | Account reports: status + category filters, paging, detail (side panel on tablets, full-screen on phones), allowed transitions only, note required to resolve/reject, 409 conflict message | `GET /api/admin/reports`, `PATCH /api/admin/reports/:id/status` |
| `SystemHealthScreen.tsx` | Overall + per-service status (colour + text), uptime / avg / p95 for 24h or 7d, "Kiểm tra ngay", pull-to-refresh | `GET /api/admin/health-monitor/status`, `/summary`, `POST /check-now` |
| `IngredientsScreen.tsx` | Master ingredients: debounced search, active/hidden filter, create/edit form, soft delete (switch), duplicate-name message | `/api/admin/ingredients` |
| `WeightsScreen.tsx` | Recommendation weights: edit 0–1 values, sent with `expectedVersion`; on 409 shows a conflict message and reloads | `/api/admin/weights` |

All screens use the shared client and UI from `../notifications/` (`gatewayApi.ts`, `useGatewayApi.ts`, `ui.tsx`) and the tokens/icons from `../../theme/`: loading / empty / error-with-retry states with an icon, accessible labels, `useWindowDimensions` layouts (1 column on phones, 2–3 on tablets/landscape).

Charts (`charts/`): `BarChart` (vertical, or horizontal for many / long labels) and `LineChart` (several series, `null` values leave a gap, legend below), drawn with `react-native-svg` and the `chartColors` tokens, without a chart library. They measure their width, so they fill one column on phones and half the width on tablets. The SVG is hidden from screen readers; each chart has an `accessibilityLabel` that summarises its data (e.g. "Báo cáo theo trạng thái: Mới 2, Đang xem xét 1, …").

Icons are Lucide (`lucide-react-native`, named imports) rendered through `AppIcon` / `IconButton`. Section tabs: LayoutDashboard (Tổng quan), Flag (Báo cáo), Activity (Hệ thống), Carrot (Nguyên liệu), SlidersHorizontal (Trọng số). Report and service statuses are shown as icon + text badges, never colour alone. Icon-only controls (report detail back button, ingredient form close button) have an `accessibilityLabel` and a 44 × 44 touch target.

## Manual test steps

Preparation: stack running, signed in as a user whose role is `ADMIN` in auth_db (and a normal user for steps 1–2).

1. **Role gating:** as a normal user the admin tab is not visible. Promote the account to ADMIN and sign in again → only the "Quản trị" tab is shown (Kho, Đi chợ, Thực đơn, … are hidden). Sign out and back in as a normal user → the normal tabs return.
2. **Server enforcement:** with a normal user's token, `GET /api/admin/reports` returns 403 (also covered by `pnpm test:e2e-smoke`).
3. **Reports:** file a report as a normal user (`POST /api/admin/reports`) → it appears under "Mới". Open it → "Đang xem xét" → "Đã xử lý" without a note shows the note error; with a note it succeeds and the reporter gets an in-app notification. A closed report shows no buttons.
4. **Report conflict:** open the same report on two devices, resolve on one, then try on the other → conflict message.
5. **System health:** after two poll cycles all services show "Hoạt động" with uptime %. Stop a service (`docker compose -p smartkitchen stop recipe-service`) → "Kiểm tra ngay" → it shows "Ngừng"; start it again → back to "Hoạt động". Switch 24h / 7d.
6. **Ingredients:** search `ca chua` finds "Cà chua". Create a duplicate name → "Tên nguyên liệu đã tồn tại." Hide an ingredient with the switch → it moves to "Đã ẩn".
7. **Weights:** change a value and save → the version increases. Edit the same weight from another device first → saving here shows the conflict message and reloads the new value. A value of `1.5` shows the range error.
8. **Responsive:** on a tablet (width ≥ 720 and height ≥ 500) reports show list + detail side by side; on a phone, also in landscape, the detail opens full screen with a back button. Health, ingredient and weight cards use 2–3 columns on wide screens and a lone last card keeps the column width. Native builds are portrait-locked by `app.config.ts`, so check landscape on web or a tablet.
9. **Errors:** stop admin-service → each screen shows the error state with "Thử lại".
10. **Directory:** "Tổng quan" shows the user / family totals and up to 5 recent rows each. "Xem tất cả →" under families → Gia đình; tap a family → detail; back → Gia đình; back → dashboard. "Xem tất cả" → Người dùng; type part of a name or email → the list filters; pull down → it reloads. Back. Tap a family → its detail with members; back (or Android back) returns to the dashboard.
11. **Statistics:** open "Thống kê". KPI numbers match the other tabs (open reports = "Mới" in Báo cáo; services match Hệ thống). Switch 24 giờ / 7 ngày → "Đã xử lý (…)" and all charts reload. Pick a service in "Theo thời gian" → both line charts show only that service; gaps appear where no sample was taken. Resolve a report → pull to refresh → "Đã xử lý" and the status chart update.
12. **Statistics states:** a fresh stack (no samples yet) shows the empty state in the time and per-service charts; stop admin-service → the dashboard shows one error with "Thử lại"; with admin-service running but a slow / failing request, only that card shows its error.
13. **Statistics accessibility:** with TalkBack / VoiceOver each chart is read as one summary sentence; KPI cards read label, value and detail.
