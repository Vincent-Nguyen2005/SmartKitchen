# Recipe Service

Owner: Cuong. Responsibility: recipe catalog and recipe authoring APIs.

## Routes

Mounted at `/api/recipes`, at `/api/recipe` (nutrition-service) and at the root (the gateway strips `/api/recipes`).

- `GET /` lists recipes (`search`, `mealType`, `active=true` for suggestable ones only).
- `GET /:id` returns one recipe.
- `POST /`, `PUT /:id` and `DELETE /:id` require `x-user-role: ADMIN` (the gateway sets it from the JWT).

A recipe keeps the plain `ingredients` names. It also has `ingredientDetails` (`[{ name, quantity, unit }]`, with the Kho unit codes), which menu-service matches against Kho. It has optional per-serving nutrition (`calories`, `protein`, `carbs`, `fat`), `imageUrl`, `allergens`, `contraindications` and `isActive` (default true).

`imageUrl` must be an https link to a public host (no localhost, private or link-local addresses, no credentials) and at most 2048 characters. The server only stores it and never fetches it. Admins set it in Quản trị > Món ăn, and hiding a dish there sets `isActive=false` (it is never deleted).

### Meal role

`role` is optional: `man`, `xao`, `canh`, `rau`, `trang_mieng`, `sang`, `mot_mon` or `do_uong`. menu-service builds lunch and dinner from these roles (món mặn, canh, rau, xào, tráng miệng). Starter dishes get their role at start where it's still empty; a role an admin set is never overwritten.

At every start the service adds starter dishes whose name is missing, so new starter dishes reach existing databases. It never updates or deletes existing rows.

### Cooking steps

`steps` is an optional JSON array: `[{ order, instruction, durationSeconds | null, ingredients: [{ name, quantity, unit }] }]`, with at most 30 steps and each timer 0-7200 s. Steps are sorted by `order` and renumbered on save; `null` means no steps yet.

At start, after the empty-table seed, the service gives each starter dish (matched by name) its Vietnamese steps from `src/seed/recipe-steps.data.ts`. It does this only where `steps` is still null, so steps an admin wrote are never overwritten, and running it again changes nothing.

## Database

- Migrations are in `prisma/migrations`. The container runs `prisma migrate deploy` at start (Prisma CLI 5.22.0).
- **Starter seed:** on start, if the `Recipe` table is empty, the service adds 26 common Vietnamese home dishes from `src/seed/recipes.data.ts`. It never updates or deletes existing rows.
- **Manual seed:** `pnpm --filter recipe-service prisma:seed` adds only the dishes whose name is missing.

### Existing database without migration history (P3005)

If `recipe_db` already has a `Recipe` table that was created without migrations (for example by `db push`), `migrate deploy` stops with **P3005**. Baseline it once, then restart the service:

```bash
docker compose run --rm --no-deps recipe-service npx --no-install prisma migrate resolve --applied 20261114213317_init_recipe_schema
docker compose up -d recipe-service   # applies 20261120000000_recipe_details
```

Mark the init migration as applied only if the table matches it (the columns before `ingredientDetails`). The newer migration then adds the remaining columns.
