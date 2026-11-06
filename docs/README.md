# SmartKitchen documentation

Last verified: 2026-11-06, on `main` at commit `2681574`.

| Document | What it covers | Owner |
|---|---|---|
| [infra.md](infra.md) | Architecture, ports and databases, local setup, CI, troubleshooting, runbook | Huy |
| [gateway.md](gateway.md) | Routing, JWT authentication, header trust model, rate limiting, caching, errors | Huy |
| [notification-service.md](notification-service.md) | Notifications, promotions, preferences, device tokens, internal API | Huy |
| [admin-service.md](admin-service.md) | Health monitor, account reports, master ingredients, recommendation weights | Huy |
| [deploy/decision.md](deploy/decision.md) | Hosting decision (Render), staged plan, budget options | Huy |
| [deploy/checklist.md](deploy/checklist.md) | Production deploy checklist | Huy |
| [e2e/README.md](e2e/README.md), [e2e/scenarios.md](e2e/scenarios.md) | E2E smoke run and scenario matrix | Huy (matrix rows by story owner) |

Mobile screens owned by Huy are documented next to the code: [notifications](../apps/mobile/src/screens/notifications/README.md) and [admin](../apps/mobile/src/screens/admin/README.md). The shared mobile theme (colours, typography, icons) is documented in [theme](../apps/mobile/src/theme/README.md).

Other services (auth, family, inventory, nutrition, meal-diary, recipe, menu, shopping-list, payment) are documented by their owners in their own folders.
