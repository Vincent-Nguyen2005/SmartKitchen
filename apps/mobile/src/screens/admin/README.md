# Admin Screens

Owner: Huy. Responsibility: administration and operational management screens (#61, backed by #48/#49/#58/#59).

## Access

- The "🛠 Quản trị" tab is rendered only when `useSession().user.role === "ADMIN"` (see `App.tsx`). `AdminHome` repeats the check and shows "Không có quyền truy cập" otherwise.
- This is a UI guard only. The real check is on the server: the gateway sets `x-user-role` from the verified access token and admin-service requires `ADMIN` on every admin endpoint.

## Screens

| File | What it does | API (through the gateway) |
|---|---|---|
| `AdminHome.tsx` | Báo cáo / Hệ thống / Nguyên liệu / Trọng số | — |
| `ReportsScreen.tsx` | Account reports: status + category filters, paging, detail (side panel on tablets, full-screen on phones), allowed transitions only, note required to resolve/reject, 409 conflict message | `GET /api/admin/reports`, `PATCH /api/admin/reports/:id/status` |
| `SystemHealthScreen.tsx` | Overall + per-service status (colour + text), uptime / avg / p95 for 24h or 7d, "Kiểm tra ngay", pull-to-refresh | `GET /api/admin/health-monitor/status`, `/summary`, `POST /check-now` |
| `IngredientsScreen.tsx` | Master ingredients: debounced search, active/hidden filter, create/edit form, soft delete (switch), duplicate-name message | `/api/admin/ingredients` |
| `WeightsScreen.tsx` | Recommendation weights: edit 0–1 values, sent with `expectedVersion`; on 409 shows a conflict message and reloads | `/api/admin/weights` |

All screens use the shared client and UI from `../notifications/` (`gatewayApi.ts`, `useGatewayApi.ts`, `ui.tsx`): loading / empty / error-with-retry states, accessible labels, `useWindowDimensions` layouts (1 column on phones, 2–3 on tablets/landscape).

## Manual test steps

Preparation: stack running, signed in as a user whose role is `ADMIN` in auth_db (and a normal user for steps 1–2).

1. **Role gating:** as a normal user the admin tab is not visible. Promote the account to ADMIN and sign in again → the tab appears.
2. **Server enforcement:** with a normal user's token, `GET /api/admin/reports` returns 403 (also covered by `pnpm test:e2e-smoke`).
3. **Reports:** file a report as a normal user (`POST /api/admin/reports`) → it appears under "Mới". Open it → "Đang xem xét" → "Đã xử lý" without a note shows the note error; with a note it succeeds and the reporter gets an in-app notification. A closed report shows no buttons.
4. **Report conflict:** open the same report on two devices, resolve on one, then try on the other → conflict message.
5. **System health:** after two poll cycles all services show "Hoạt động" with uptime %. Stop a service (`docker compose -p smartkitchen stop recipe-service`) → "Kiểm tra ngay" → it shows "Ngừng"; start it again → back to "Hoạt động". Switch 24h / 7d.
6. **Ingredients:** search `ca chua` finds "Cà chua". Create a duplicate name → "Tên nguyên liệu đã tồn tại." Hide an ingredient with the switch → it moves to "Đã ẩn".
7. **Weights:** change a value and save → the version increases. Edit the same weight from another device first → saving here shows the conflict message and reloads the new value. A value of `1.5` shows the range error.
8. **Responsive:** on a tablet / landscape, reports show list + detail side by side; health cards use 2–3 columns.
9. **Errors:** stop admin-service → each screen shows the error state with "Thử lại".
