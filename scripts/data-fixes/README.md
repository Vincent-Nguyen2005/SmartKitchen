# Data fixes

One-off corrections of data in an existing database, for changes the startup seeds do not make. Seeds only add missing rows and never overwrite existing ones. Each script changes data only through the admin API (via the gateway), so validation, audit logs and promotion sync run as usual.

## How to run

Run a script inside the **auth-service** container. It reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from that container's environment, logs in, and never prints them:

```sh
docker compose -p smartkitchen exec -T auth-service node - < scripts/data-fixes/<script>.js
```

- **Gateway address:** `http://gateway:4000` by default. Set `GATEWAY_URL` inside the container if yours differs.
- **Idempotent:** every script can be run again safely. Already-applied changes are counted and not sent again.

## Scripts

| Script | What it changes | Skips |
|---|---|---|
| `2026-11-recipe-review.js` | Corrected data for 34 starter dishes from the recipe review (PR #86): kcal and macros, ingredients, steps and timers, allergen and contraindication tags. Also sets real kcal per 100 g on the staple catalog rows that still show the 50 kcal placeholder. | Dishes an admin edited after seeding (listed by name), and dishes already corrected. Image links, visibility and names are never touched. Catalog rows whose kcal is not exactly 50. |
| `2026-11-catalog-macros.js` | Real protein / carbs / fat per 100 g for the 30 staple catalog rows that still have the placeholder values 3 / 8 / 1 (the same values as `catalogMacros` in `services/admin-service/src/seed/catalog.data.ts`). | Rows whose macros are not exactly 3 / 8 / 1. |

New starter dishes and new catalog ingredients don't need a script: recipe-service and admin-service add any missing starter names at start.
