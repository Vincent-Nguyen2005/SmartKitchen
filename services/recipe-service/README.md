# Recipe Service

Owner: Cuong. Responsibility: recipe catalog and recipe authoring APIs.

## Routes

Mounted at `/api/recipes`, at `/api/recipe` (nutrition-service) and at the root (the gateway strips `/api/recipes`).

- `GET /` lists recipes (`search`, `mealType`, `active=true` for suggestable ones only).
- `GET /:id` returns one recipe.
- `POST /`, `PUT /:id` and `DELETE /:id` require `x-user-role: ADMIN` (the gateway sets it from the JWT).
- `DELETE /:id` deletes for good only when menu-service reports no saved menu item and no dislike-history row with this recipe id (`GET /internal/recipes/:id/usage`, `INTERNAL_API_KEY`, `MENU_SERVICE_URL`). Otherwise `409 { code: "IN_USE", reasons }` and nothing is deleted; if menu-service cannot answer, `503 USAGE_CHECK_UNAVAILABLE`. A deleted starter dish gets a row in `deleted_starter_recipes` (migration `20261128000000_deleted_starter_recipes`), and the startup seed skips those names.

A recipe keeps the plain `ingredients` names. It also has `ingredientDetails` (`[{ name, quantity, unit }]`, with the Kho unit codes), which menu-service matches against Kho. It has optional per-serving nutrition (`calories`, `protein`, `carbs`, `fat`), `imageUrl`, `allergens`, `contraindications` and `isActive` (default true).

`imageUrl` must be an https link to a public host (no localhost, private or link-local addresses, no credentials) and at most 2048 characters. The server only stores it and never fetches it. Admins set it in Quản trị > Món ăn. Hiding a dish there sets `isActive=false`; "Xóa" uses the safe delete above.

### Meal role

`role` is optional: `man`, `xao`, `canh`, `rau`, `trang_mieng`, `sang`, `mot_mon` or `do_uong`. menu-service builds lunch and dinner from these roles (món mặn, canh, rau, xào, tráng miệng). Starter dishes get their role at start where it's still empty; a role an admin set is never overwritten.

At every start the service adds starter dishes whose name is missing, so new starter dishes reach existing databases. It never updates or deletes existing rows.

### Seasonings

An ingredient may carry `isSeasoning: true` (a pantry staple such as muối, nước mắm or dầu ăn) and a free-text amount in `note` ("vừa ăn", "1 muỗng canh") with `quantity: null`.

At start, `fillSeasonings` gives starter dishes their typical seasonings (`src/seed/seasonings.data.ts`, by dish role with per-dish overrides). It only adds missing lines, never changes or deletes existing ingredients, and skips dishes that already have a seasoning line, so running it again changes nothing. Steps change only when they are still the starter steps (compared by content): the step that already says "nêm" gets the amounts appended. Admin-edited steps are never rewritten.

### Per-person ingredients

An ingredient may carry `perPerson: true`: it is eaten one per person (bánh mì, trứng ốp la, a glass of milk or orange juice, a fruit or yoghurt). Menus scale it per person (see menu-service "Portions").

- Admins set it with "Theo người" on each ingredient row in Quản trị › Món ăn. The form always saves the flag (true or false).
- At start, `fillPerPerson` (`src/seed/per-person.ts`) sets it on the obvious starter-dish ingredients, only where the flag is still unset. Admin choices are never changed, and running it again changes nothing. The log gives a count.

### Health tags

At start, `fillHealthTags` (`src/seed/health-tags.ts`) gives starter dishes (matched by name) `allergens` and `contraindications`. The values use the nutrition-service catalog names, and menu-service's family health rules read them.

- **Only empty fields are filled.** A field that already has tags (seeded or admin-edited) is never changed, so running it again changes nothing. If an admin clears a field, the next start fills it again.
- **Allergens** come from ingredient names, seasonings included. Words are matched whole, with accents kept:
  - tôm, cua, mực → that seafood + Hải sản; hải sản, nghêu, sò, hến, ốc → Hải sản
  - cá → Cá; trứng → Trứng; sữa → Sữa (not sữa đậu nành)
  - đậu phộng, lạc → Đậu phộng; đậu nành, đậu phụ, đậu hũ, nước tương, xì dầu → Đậu nành
  - gluten, lúa mì, bột mì, bánh mì, mì, bột chiên → Gluten (not mì chính); mè, vừng → Mè
  - Nước mắm is not tagged Cá: it's in almost every dish.
- **Contraindications** use simple, conservative rules:
  - Tiểu đường: chè, "chua ngọt", sweet drinks, and desserts with sugar, condensed milk or coconut cream.
  - Cao huyết áp: kho, rim, mắm, dưa muối, cà pháo, and processed meats.
  - Gout: organ meats, seafood, and rich beef or bone-broth dishes.
  - Mỡ máu cao: fried and fatty dishes (chiên, rán, quay, giòn; thịt ba chỉ, mỡ, da heo, processed meats).
- The startup log gives the count: `added health tags to N recipes`.

### Cooking steps

`steps` is an optional JSON array: `[{ order, instruction, durationSeconds | null, ingredients: [{ name, quantity, unit }] }]`, with at most 30 steps and each timer 0-7200 s. Steps are sorted by `order` and renumbered on save; `null` means no steps yet.

At start, after the empty-table seed, the service gives each starter dish (matched by name) its Vietnamese steps from `src/seed/recipe-steps.data.ts`. It does this only where `steps` is still null, so steps an admin wrote are never overwritten, and running it again changes nothing.

## Database

- Migrations are in `prisma/migrations`. The container runs `prisma migrate deploy` at start (Prisma CLI 5.22.0).
- **Starter seed:** on start, the service adds the starter dishes (63 common Vietnamese home dishes and drinks in `src/seed/recipes.data.ts`) whose name is missing. It never updates or deletes existing rows.
- **Realism checks:** `src/seed/starter-record.ts` builds the full record a starter dish gets on a fresh database (seasonings, per-person flags, health tags). `recipe.seed-realism.test.ts` checks every starter dish: macros add up to the calories within 5%, allergen tags cover the ingredients (seasonings included, e.g. nước tương means Đậu nành), contraindications use the catalog spelling, steps use only listed ingredients and every main ingredient appears in a step. Calories are home-cooking estimates.
- **Manual seed:** `pnpm --filter recipe-service prisma:seed` adds only the dishes whose name is missing.

### Existing database without migration history (P3005)

If `recipe_db` already has a `Recipe` table that was created without migrations (for example by `db push`), `migrate deploy` stops with **P3005**. Baseline it once, then restart the service:

```bash
docker compose run --rm --no-deps recipe-service npx --no-install prisma migrate resolve --applied 20261114213317_init_recipe_schema
docker compose up -d recipe-service   # applies 20261120000000_recipe_details
```

Mark the init migration as applied only if the table matches it (the columns before `ingredientDetails`). The newer migration then adds the remaining columns.
