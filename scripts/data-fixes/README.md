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
| `2026-12-catalog-complete.js` | Creates the 34 catalog products the starter recipes use but the catalog lacked, then fills only empty or placeholder values on existing products: price, protein/carbs/fat, obvious allergens, the legacy unit `g` → `GRAM`. **Dry run by default**; `APPLY=1` writes. | Values already set (never overwritten), discount fields, and names deliberately deleted before. |
| `2026-12-catalog-sale-units.js` | Nothing sold by the gram: the 32 meat / fish / seafood / vegetable / mushroom / tuber / bean products go `GRAM` → `KILOGRAM` with the price per kg (an admin-set per-gram price is converted ×1000); 8 small aromatics go `GRAM` → `PACK` (bó / gói) with a pack price and `packGrams`. Fixes Thịt ba chỉ (350 kcal) and Thịt vịt (400 kcal) while they still have the old starter values. Run after rebuilding admin-service (needs the `packGrams` column). **Dry run by default**; `APPLY=1` writes. | Rows no longer on `GRAM`, pack products whose price an admin changed, edited macros, discount fields; nothing is deleted. |
| `2026-12-rau-song.js` | "Rau sống" is a mixed plate, not one ingredient. 1) Recipes: Bún chả `Rau sống 200 g` → `Xà lách 130 g` + `Rau thơm 70 g`; Mì Quảng `Rau sống 200 g` → `Xà lách 80 g` + `Giá đỗ 70 g` + `Rau thơm 50 g` (step and description too). 2) Then deletes the catalog product through the admin API, which refuses while Kho, a cart, a recipe or a promotion uses it, and leaves a DELETE audit row. **Dry run by default**; `APPLY=1` writes. | Recipes an admin edited (skipped), every other catalog product. |
| `2026-12-recipe-ingredient-names.js` | Aligns two recipe ingredient names with the catalog: "Đậu cô ve" → "Đậu que" and the seasoning "Tỏi phi" → "Tỏi" ("1 muỗng canh (phi vàng)"). **Dry run by default**; `APPLY=1` writes. | Dishes an admin edited after seeding. |
| `2026-12-delete-e2e-promotions.js` | Deletes test leftovers: promotions whose title starts with `e2e-`. **Dry run by default**; set `APPLY=1` (`docker compose -p smartkitchen exec -T -e APPLY=1 auth-service node - < …`) to delete. Prints counts only. | Every other promotion. |
| `2026-12-catalog-english-names.js` | Fills the optional `englishName` (photo recognition alias, e.g. "carrot") on catalog rows that don't have one, using the starter seed values. | Rows that already have an alias (an admin's alias is never changed). |
| `2026-11-catalog-macros.js` | Real protein / carbs / fat per 100 g for the 30 staple catalog rows that still have the placeholder values 3 / 8 / 1 (the same values as `catalogMacros` in `services/admin-service/src/seed/catalog.data.ts`). | Rows whose macros are not exactly 3 / 8 / 1. |

New starter dishes and new catalog ingredients don't need a script: recipe-service and admin-service add any missing starter names at start.
