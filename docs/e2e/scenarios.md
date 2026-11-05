# Scenario Matrix

Last verified: 2026-11-04, on `feat/sprint-4-huy` at commit `d792648` (local docker compose stack).

Status values:

- **Verified**: run against the local stack with the expected result. "smoke" means it is automated in `scripts/test-e2e-smoke.*`; "manual" means it was run by hand with the listed steps.
- **Ready**: the service side exists and can be run, but the full flow has not been verified end to end.
- **Blocked**: a dependency is missing (workflow contract, credentials). Reported as SKIP by the smoke run.

| ID | Story | Preconditions | Steps | Expected result | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| E2E-01 | Auth register/login (#2) | Auth service ready; SMTP configured for register | Register, verify OTP, login through `/api/auth` | Tokens returned | Kazan | Ready: login error responses verified (401, 400, 403 as documented by auth-service); register needs SMTP (`503 EMAIL_NOT_CONFIGURED` without it) |
| E2E-02 | Family create/invite (#12/#13) | Auth token | Create family and invite member | Family membership updated | Kazan | Blocked: family workflow contract |
| E2E-03 | Inventory expiry alert (#43) | Family and inventory data | Add item with expiry, query alerts | Alert is generated | Khanh | Blocked: inventory workflow contract |
| E2E-04 | Nutrition TDEE (#45) | User profile | Save profile, calculate TDEE | Nutrition result returned | Hung | Blocked: nutrition workflow contract |
| E2E-05 | Meal diary stats (#44/#45) | Nutrition profile | Log meal, query daily stats | Daily totals returned | Hung | Blocked: diary workflow contract |
| E2E-06 | Recipe CRUD (#27) | Recipe service healthy | Create, read, update, delete recipe | CRUD responses are correct | Cuong | Blocked: recipe workflow contract |
| E2E-07 | Menu generation (#27) | Recipes and profile | Request menu through gateway | Menu returned | Cuong | Blocked: menu workflow contract |
| E2E-08 | Shopping list (#29) | Menu and inventory | Generate missing-item list | List contains missing items | Khanh | Blocked: shopping workflow contract |
| E2E-09 | Payment sandbox (#31) | Sandbox credentials | Create VNPay/MoMo payment | Sandbox redirect/status returned | Cuong | Blocked: provider credentials |
| E2E-10 | Promotion notification (#34) | Notification DB, `PARTNER_API_KEY`, `JWT_SECRET` | Through the gateway with signed dev tokens: USER registers a device token, partner ingests a promotion, match, USER dispatch is refused, ADMIN dispatches (mock), USER lists the inbox; a second USER tries the first user's inbox, preferences and token | Notification is SENT once; no token 401; USER dispatch 403; other user's inbox/preferences 403 and token delete 404; owner deletes the token 204 | Huy | Verified (smoke) |
| E2E-11 | Admin catalog (#48) | Admin DB seeded | CRUD ingredient, soft-delete, export | Audit row and catalog changes exist | Huy | Verified (smoke) |
| E2E-12 | Recommendation weights (#49) | Admin DB seeded | Update with expected version, repeat stale version | First update succeeds, second is 409 | Huy | Verified (smoke) |
| E2E-13 | Gateway performance (#60) | Gateway and recipe/notification service healthy | Repeat public notification promotion GET, authenticated GET, POST, exceed limiter | MISS/HIT/BYPASS and 429 JSON are returned | Huy | Verified (smoke) |
| E2E-14 | Gateway routing (#5) | Docker stack | Query all service health routes and unknown route | Eleven routes 200, unknown 404 | Huy | Verified (smoke + `pnpm test:routing`) |
| E2E-15 | Gateway JWT identity (Sprint 4) | `JWT_SECRET` shared by gateway and auth | Call `/api/admin/reports` with no token, an invalid token, a USER token and an ADMIN token; send a forged `x-user-role: ADMIN` header; call `/api/notifications/internal/notifications` | Invalid token 401 (gateway); no token and USER token 403 (admin-service); ADMIN token 200; the forged header is ignored; `/internal/*` is 404 | Huy | Verified (smoke for invalid token and the admin role check; the rest manual) |
| E2E-16 | Admin health monitor (#58) | Stack running, `ENABLE_JOBS=true` | Wait two polls, `GET /api/admin/health-monitor/status` and `/summary?window=24h`; stop one service, `POST /check-now`; start it again | All UP with uptime %; the stopped service is DOWN and overall DEGRADED; exactly one audit row per DOWN transition; recovery back to UP | Huy | Verified (manual) |
| E2E-17 | Account reports (#59) | Two users (USER, ADMIN) | USER files a report; ADMIN moves it OPEN → IN_REVIEW → RESOLVED with a note; repeat a stale transition; USER lists `/reports/mine` and the inbox | 201, then 200s; resolving without a note is 400; the stale change is 409; the reporter receives one in-app notification; the 6th report within an hour is 429 | Huy | Verified (manual) |
