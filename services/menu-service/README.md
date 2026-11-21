# Menu Service

Owner: Cuong. Responsibility: menu planning and meal schedule APIs.

## Gợi ý theo Kho

`POST /generate` (gateway: `/api/menu/generate`) takes `{ periodType, startDate, endDate, familyId? }`. It then:

1. Loads the active recipes from recipe-service (`RECIPE_SERVICE_URL`).
2. Loads the family's Kho from inventory-service (`INVENTORY_API_URL`), forwarding the caller's `Authorization` header so inventory checks family membership. Items that are used up, discarded or expired are left out.
3. Picks one dish per meal (sáng/trưa/tối) per day by score. The scoring is in `src/services/kho-suggest.ts`:
   - the share of the recipe's ingredients in Kho (accent-insensitive names, quantities compared when the units allow);
   - plus a bonus for ingredients that expire within 3 days;
   - minus a small penalty for a dish planned in the 3 previous days.

   With an empty Kho, it picks varied popular dishes instead.
4. Saves each dish's `details` (`availableIngredients`, `missingIngredients` with quantity and unit, `availableCount`, `totalCount`, `reason`). The new menu replaces the user's menu for the same period and dates.

If recipe-service or inventory-service is down, the endpoint returns 503 with a Vietnamese message.

## Database

Migrations are in `prisma/migrations`. The container runs `prisma migrate deploy` at start (Prisma CLI 5.22.0).

### Existing database without migration history (P3005)

If `menu_db` already has the `Menu`/`MenuItem` tables (created without migrations, for example by `db push`), `migrate deploy` stops with **P3005**. Add the new columns, then baseline:

```bash
docker compose exec -T menu-db psql -U postgres -d menu_db -c 'ALTER TABLE "Menu" ADD COLUMN IF NOT EXISTS "familyId" TEXT; ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "details" JSONB; CREATE INDEX IF NOT EXISTS "Menu_familyId_startDate_idx" ON "Menu"("familyId", "startDate");'
docker compose run --rm --no-deps menu-service npx --no-install prisma migrate resolve --applied 20261120000000_init_menu_schema
docker compose up -d menu-service
```

An empty `menu_db` (the usual case) needs nothing: the first start creates the tables.
