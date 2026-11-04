# Scenario Matrix

| ID | Story | Preconditions | Steps | Expected result | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| E2E-01 | Auth register/login (#2) | Auth service ready | Register, login through `/api/auth` | Tokens returned | Kazan | Blocked: auth workflow contract |
| E2E-02 | Family create/invite (#12/#13) | Auth token | Create family and invite member | Family membership updated | Kazan | Blocked: family workflow contract |
| E2E-03 | Inventory expiry alert (#43) | Family and inventory data | Add item with expiry, query alerts | Alert is generated | Khanh | Blocked: inventory workflow contract |
| E2E-04 | Nutrition TDEE (#45) | User profile | Save profile, calculate TDEE | Nutrition result returned | Hung | Blocked: nutrition workflow contract |
| E2E-05 | Meal diary stats (#44/#45) | Nutrition profile | Log meal, query daily stats | Daily totals returned | Hung | Blocked: diary workflow contract |
| E2E-06 | Recipe CRUD (#27) | Recipe service healthy | Create, read, update, delete recipe | CRUD responses are correct | Cuong | Blocked: recipe workflow contract |
| E2E-07 | Menu generation (#27) | Recipes and profile | Request menu through gateway | Menu returned | Cuong | Blocked: menu workflow contract |
| E2E-08 | Shopping list (#29) | Menu and inventory | Generate missing-item list | List contains missing items | Khanh | Blocked: shopping workflow contract |
| E2E-09 | Payment sandbox (#31) | Sandbox credentials | Create VNPay/MoMo payment | Sandbox redirect/status returned | Cuong | Blocked: provider credentials |
| E2E-10 | Promotion notification (#34) | Notification DB and `PARTNER_API_KEY` | Register token, ingest promotion, match, dispatch mock, list notifications | Notification is SENT once | Huy | Verified |
| E2E-11 | Admin catalog (#48) | Admin DB seeded | CRUD ingredient, soft-delete, export | Audit row and catalog changes exist | Huy | Verified |
| E2E-12 | Recommendation weights (#49) | Admin DB seeded | Update with expected version, repeat stale version | First update succeeds, second is 409 | Huy | Verified |
| E2E-13 | Gateway performance (#60) | Gateway and recipe/notification service healthy | Repeat public notification promotion GET, authenticated GET, POST, exceed limiter | MISS/HIT/BYPASS and 429 JSON are returned | Huy | Verified |
| E2E-14 | Gateway routing (#5) | Docker stack | Query all service health routes and unknown route | Eleven routes 200, unknown 404 | Huy | Verified |
