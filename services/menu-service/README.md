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

## Món gợi ý từ Kho (AI)

`GET /ai-suggestions?familyId=` (gateway: `/api/menus/ai-suggestions`) returns `{ status, dishes, generatedAt, limitReached }`. `status` is `ready`, `generating`, `not_configured`, `empty_kho` or `error`.

- **Model:** a Gemini text model via `POST …/v1beta/models/${GEMINI_MODEL}:generateContent`, with the key in the `x-goog-api-key` header and structured JSON output. It has a 20 s timeout and uses no SDK.
- **Configuration:** `GEMINI_API_KEY` and `GEMINI_MODEL` come from the environment. If either is empty, the status is `not_configured` and the app hides the section.
- **What is sent:** only Kho item names, quantities, units and an "expiring within 3 days" flag. Expired items are left out, and nothing about the user or family is sent.
- **Validation:** every dish is checked against a schema. Invalid dishes are dropped, and values are clamped: 1–10 servings, step timers 0–7200 s, at most 15 steps, at most 3 dishes. Whether an ingredient is in Kho is recomputed by name.
- **When it regenerates:** each read loads the family's Kho with the caller's token, which also checks membership, and hashes a snapshot of it.
  - Same hash as the stored result: the stored dishes are returned and the model is not called.
  - Different hash: a regeneration runs 2 minutes after the last change seen, so several edits make one call. The previous dishes stay visible with status `generating`.
  - Nothing stored yet: generation starts right away.
- **Limits and errors:** at most 8 model calls per family per Vietnam day. After that the last result stays (`limitReached`). Model errors (including 429) keep the previous dishes with status `error`; the same Kho is not retried, and a Kho change tries again.
- **Storage:** the latest result per family is kept in `AiSuggestion` (dishes, Kho hash, generatedAt, daily count). Pending debounces live in memory, so a restart just reschedules on the next read.
- **Saved dishes:** `POST /ai-suggestions/:dishId/save { familyId }` keeps a dish as a family-only `SavedRecipe` (source `ai`), and `GET /ai-recipes?familyId=` lists them. Both check membership with family-service.

## Listing menus

`GET /` (gateway: `/api/menu`) returns the user's menus. Add `?from=YYYY-MM-DD&to=YYYY-MM-DD` (at most 62 days) to get only the menus that overlap that range. The Thực đơn tab uses this to load a week or a month grid in one request.

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
