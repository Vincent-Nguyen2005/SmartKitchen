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

`GET /ai-suggestions` (gateway: `/api/menus/ai-suggestions`; `familyId` is optional and must be the caller's family) returns `{ status, dishes, generatedAt, limitReached }`. `status` is `ready`, `generating`, `not_configured`, `empty_kho` or `error`.

- **Model:** a Gemini text model via `POST …/v1beta/models/${GEMINI_MODEL}:generateContent`, with the key in the `x-goog-api-key` header and structured JSON output. It has a 20 s timeout and uses no SDK.
- **Configuration:** `GEMINI_API_KEY` and `GEMINI_MODEL` come from the environment. If either is empty, the status is `not_configured` and the app hides the section.
- **What is sent:** Kho item names, quantities, units and an "expiring within 3 days" flag (expired items are left out), plus anonymous family aggregates (`src/services/ai/family-ai.ts`):
  - the number of people eating;
  - the members' combined allergies (catalog and custom) as "must not contain";
  - their combined conditions as "avoid if possible";
  - the family's kcal per meal (the sum of 25 / 40 / 35 % of each TDEE).
  - Names and user ids are never sent. The family data comes from the same family context as menus, including the last known context when a service is down.
- **What is asked:** dishes with `servings` equal to the number of people, kcal and protein / carbs / fat per serving, `mealType`, `isSeasoning` and `perPerson` on ingredients, and allergen / contraindication tags (catalog names).
- **Validation:** every dish is checked against a schema. Invalid dishes are dropped, and values are clamped: 1–10 servings, kcal 0–3000 and macros 0–300 g per serving, step timers 0–7200 s, at most 15 steps, at most 3 dishes. Whether an ingredient is in Kho is recomputed by name.
- **Family rules** (the same matcher as menu generation):
  - A dish containing any member's allergen (by tags or ingredient name) is dropped.
  - A dish unsuitable for a member carries `warnings: [{ memberUserId, memberName, condition }]`. They're added locally, never sent to the model, and visible to the whole family.
  - The rules run at generation time and again on every read, so a new allergy hides an unsafe stored dish right away.
- **When it regenerates:** each read resolves the caller's family (as for menus), loads its Kho with the caller's token and the family context, and hashes the Kho snapshot together with a hash of the members' allergies, conditions and targets (names don't count). A profile change therefore regenerates the dishes like a Kho change does, with the same debounce and daily limit.
  - Same hash as the stored result: the stored dishes are returned and the model is not called.
  - Different hash: a regeneration runs 2 minutes after the last change seen, so several edits make one call. The previous dishes stay visible with status `generating`.
  - Nothing stored yet: generation starts right away.
- **Limits and errors:** at most 8 model calls per family per Vietnam day. After that the last result stays (`limitReached`). Model errors (including 429) keep the previous dishes with status `error`; the same Kho is not retried, and a Kho change tries again.
- **Storage:** the latest result per family is kept in `AiSuggestion` (dishes, Kho hash, generatedAt, daily count). Pending debounces live in memory, so a restart just reschedules on the next read.
- **Saved dishes:** `POST /ai-suggestions/:dishId/save` keeps a dish as a family-only `SavedRecipe` (source `ai`), and `GET /ai-recipes` lists them. Both resolve the caller's family through family-service `/internal/families/memberships`, as menus do.
- **In the app:** AI dishes reach the app as a swap fallback (stored on the menu dish with its kcal and warnings) and in "Lưu món". Their quantities use the shared portions helper ("cho N người"), and cooking one logs 1 portion with the dish's per-serving macros.

## Seasonings

Ingredients with `isSeasoning` (from recipe-service, or AI dishes, which now list common seasonings with `isSeasoning=true`) are left out of Kho matching, "Có sẵn X/Y", the score and the missing list.

## Family-owned menus

Menus belong to the family: every member sees and changes the same menu. Users without a family keep personal menus, which work as before.

- **Who owns a request:** the gateway's `x-user-id` is looked up in family-service `POST /internal/families/memberships`, using `INTERNAL_API_KEY` and `FAMILY_SERVICE_URL`.
  - **In a family:** generate, list (with `from`/`to`), get, delete, `auto-refresh`, `top-up`, `generate-days`, remove/swap and settings all work on the family's menus.
  - **No family:** everything is read by `userId`, as before.
  - **Errors:** a `familyId` in the request that isn't the caller's family gives 403. If family-service can't be reached, the request gets 503; it never switches silently to personal menus.
- **One menu per family, day and period:** a partial unique index enforces this for active menus (`"Menu_family_period_active_key"`, created in SQL in migration `20261125000000_family_menus`, because Prisma can't declare a partial index).
  - Generating again replaces the family's menu ("Làm mới theo kho").
  - If two members generate at the same moment, the index lets one win, and the other request returns that menu. No duplicates.
- **Menu fields:** `servings` is the family's member count when the menu was generated (1 for personal menus, null for older menus). `userId` is the member who generated it.
- **"Số món mỗi bữa" (dormant):** `FamilyMenuSettings` / `MenuSettings` and `GET/PUT /settings` are kept, but the app no longer shows the setting and the planner ignores it (dishes and portions now come from the family's kcal targets, see "Calorie-based day menus").
- **Dislike history:** `RemovedDish.familyId` is set for family removals. Dishes removed by any member are skipped for the whole family for 7 days.

### Family health rules and calories

Every path that picks dishes (generate, `generate-days`, `top-up`, `auto-refresh`, remove/swap and the AI fallback) loads the family context (`src/services/family-context.ts`):

- **Where it comes from:** members from family-service `GET /internal/families/:id/members`, profiles from nutrition-service `POST /internal/profiles`.
  - Both use `INTERNAL_API_KEY` with a 3 s timeout. `NUTRITION_SERVICE_URL` is set in compose.
  - A user without a family counts as a family of one.
  - Complete results are cached for 5 minutes per family and saved as the family's last known context (`FamilyHealthContext` in the menu DB).
  - If a service is unavailable, the last known context is used, so allergies are never dropped once they have been seen.
  - Only when no context was ever loaded do the defaults apply (2000 kcal, 500 / 800 / 700, no allergies or conditions). The generated menu then gets `healthUnavailable: true`, and the app shows a notice on Lịch.
  - Degraded results are not cached or saved. Logs give counts only.
- **Allergies (hard exclusion):** a dish is never used when any member is allergic to it. That means an allergen tag equals the allergy (accent- and case-insensitive), or an ingredient name matches it with the Kho matching rule ("Tôm" matches "Tôm sú"; one-word names keep their accents, so "Cá" doesn't match "Cà chua"). Seasonings count, and catalog and custom allergies both count. AI fallback dishes are checked by ingredient name.
- **Health conditions:** dishes whose contraindication tags equal a member's condition are used only when a slot can't be filled with a dish suitable for everyone.
  - Such a dish stores `details.warnings: [{ memberUserId, memberName, condition }]`, visible to every family member.
  - It also stores `details.alternative: { recipeId, dishName, imageUrl }`: the best Kho-scored suitable dish for the same meal that isn't already in the day.
- **Calories:** the family target of a meal is the sum of the members' meal targets (each member: Mifflin-St Jeor TDEE × 1.375; Bữa sáng 25 %, trưa 40 %, tối 35 %). A member without a health profile counts as 2000 kcal a day; with no health data at all, every member counts as 2000 kcal. The planner (`src/services/meal-plan.ts`) chooses the number of dishes and their portions from this target (see "Calorie-based day menus").

### Portions (quantities for the people eating)

`src/services/portions.ts` holds the one scaling rule. The app has an identical copy in `apps/mobile/src/screens/recipes/portions.ts`.

- **People / portions:** each planned dish stores its portions in `details.servings` (calorie-based menus); quantities scale to those portions (`dishServings`). Older dishes use the menu's `servings` (the family's member count when generated; personal menus 1), or the current member count. Recipe servings null or 0 count as 1.
- **Normal ingredient:** quantity × people / recipe servings, unchanged when they're equal.
- **`perPerson` ingredient:** each person's amount (quantity / servings) is rounded up first, then multiplied by the people.
- **Seasonings** scale the same way; free-text amounts ("vừa ăn") stay as text.
- **Rounding:** pieces (cái/quả, gói/bó, chai, lon, hộp) round up to whole numbers; g and ml round to the nearest 5 (at least 5); kg, lít and other units keep 2 decimals.
- **Where it's used:** Kho matching and the score, "Có sẵn X/Y" and the stored missing list (what goes to the cart), "Cần mua tuần này" (week-missing) and, in the app, Lịch / Nấu ăn, cooking mode and the Kho deduction all use the amounts scaled to the dish's portions.

### Family backfill (startup, idempotent)

After `prisma migrate deploy`, the service runs a data step in the background. It logs counts only, never names or ids:

- **Migration SQL first:** among menus that already had a `familyId` (the family whose Kho they used), it keeps the most recently updated menu per family, day and period active. The others are archived. Then it creates the unique index.
- **Menus without a family:** each one whose creator is now in a family gets that family. If the family already has an active menu for that day and period, the more recently updated one stays active and the other is archived. `updatedAt` is kept, so later runs agree. Archived menus stay readable by id and are never listed or deleted.
- **Dislike history:** members' `RemovedDish` rows without a family get the family, so the members' history is merged.
- **Settings:** a family without `FamilyMenuSettings` gets its OWNER's personal setting, or else the most recently updated member setting. A family with no settings at all keeps the defaults.
- **Repeat runs:** the step only touches rows without a family, so running it again changes nothing. It is skipped (with a warning) when `INTERNAL_API_KEY` is missing. If it fails, it is retried at the next start.
- **Users without a family:** nothing changes for them.

Log line: `[menu-service] family backfill: N menus assigned to families, N archived, N removed dishes merged, N family settings created`.

## Calorie-based day menus, saved, one-dish replacement

`src/services/meal-plan.ts` (pure, tested in `menu.calories.test.ts`) replaces the fixed "Số món mỗi bữa":

- **Target per meal:** the family's meal target (see "Calories" above).
- **Dishes per meal:**
  - **Bữa sáng:** 1 dish (roles sang / mot_mon); a drink (do_uong) is added only when the dish cannot reach 90 % of the target.
  - **Bữa trưa / tối:** the main decides the shape. A món mặn (rice meal) that fits the variety rules always wins over a one-plate dish.
    - **Weekly caps** (rolling: every 7-day window containing the day, saved days before and after counted): one-plate lunch / dinner meals at most 1 a day and 3 a week; foreign meals (main or breakfast dish western / asian) at most 3 a week, next to 1 per meal / 2 per day. Order when the catalog can't satisfy everything: (1) món mặn, all variety rules, foreign cap kept → (2) một món within its caps and the foreign cap, all variety rules → (3) món mặn, relaxed variety → (4) một món within its caps, relaxed variety → (5) món mặn over the weekly foreign cap → (6) một món over the weekly caps (still 1 a day) → (7) một món over every cap. Breakfast: dishes within the weekly foreign cap first, then any. Allergens are never in any pool, so no step breaks an allergy rule.
    - **Vietnamese món mặn:** + a Vietnamese canh or rau, with rice ("Kèm cơm trắng"); a Vietnamese side (xào / khai vị / mặn) only when the meal stays under 90 %.
    - **Foreign món mặn** (western / asian): never with a Vietnamese canh / rau and never with rice; one side of the same cuisine only when under 90 % (or none). That side belongs to the same foreign meal, so it does not count against the cuisine caps (the caps count foreign meals).
    - **One-plate dish** (role mot_mon: phở, bún, mì, cơm chiên, Bò bít tết with fries, Cá hồi áp chảo with broccoli, Cà ri gà kiểu Nhật with rice): alone, no canh, no rice; one light (≤ 250 kcal / serving) rau or canh of the same cuisine only when under 90 %.
    - Swaps keep this: the replacement has the cuisine of the dish left in the meal.
  - **Cơm trắng:** the catalog has no plain rice dish, so 35 % of a lunch / dinner with món mặn is counted as rice and the dishes cover the rest. The meal's món mặn stores it as `details.riceKcal` and as a planned ingredient `details.riceGrams` = raw Gạo grams = rice kcal ÷ 3,25 (cooked rice ≈ 130 kcal / 100 g, 1 g raw ≈ 2,5 g cooked; ≈ 100 g raw per big bowl), rounded up to 10 g. It is counted once per meal in "Cần mua tuần này" (catalog Gạo, kg), and the app lists it in the món mặn's detail so "Hoàn thành" on that dish takes it out of Kho (FEFO, inventory-service cook). After a swap the rice moves to the meal's món mặn. Menus saved before rice became an ingredient only have `riceKcal`: their Gạo is derived from it (same formula) only when the carrying dish is a Vietnamese món mặn (`storedRiceGrams`; the app uses the same rule).
- **Portions:** the dishes' share is split by role (main 50 %, vegetable / soup 30 %, side 20 %, renormalised over the dishes present; breakfast dish 75 % / drink 25 %), then servings = share ÷ kcal per serving, whole numbers, within per-person caps (main 0,5–1,5, one-dish meal 0,75–1,5, vegetable / soup 0,5–1,5, side 0,5–1, drink 0,5–1,25; never inflated beyond them), and single servings are moved to get as close to the target as the bounds allow. If a meal is still under 90 % after the caps, one allowed side (same pairing rules) is added, and a second one only below the 85 % floor; a meal may therefore end slightly under target (85–90 %), and only below 85 % when the catalog has no allowed side left. A meal never aims above the target; it only passes 115 % when even the minimum portions do (then portions shrink towards 1 each). Breakfast with one dish: one serving per family member, adjusted by at most ±25 % towards the target. Each dish stores `details.servings`; the meal's first dish also `details.mealTarget`.
- **Choosing the dish for a slot:** recipes of the slot's roles that fit the meal, not already in the day, within the cuisine caps. Variety first (any meal, saved days before AND after included): a main (món mặn / một món) not within ±6 days (no repeat in 7 days); a canh / rau / side not within ±2 days (3 days); a breakfast dish not within ±3 days (4 days) and not the same family (bánh mì, bún, phở, xôi, cháo, mì, cơm…) on the day before or after. When the catalog cannot satisfy them they relax in this order: without the breakfast family rule → half the window → only not the day before / after → anything not already in the day; each relaxed step keeps the dishes used least often in the surrounding week, so repeats are spread evenly. Then the Kho score: 100 × share of ingredients usable in Kho, +15 per expiring item (≤ 3 days, at most 2) and up to +3 per item the sooner it expires, −10 repeat. A small tie-break (≤ 10 points) prefers dishes whose natural portion is about one serving per person, and a near-zero-kcal dish never fills a slot meant to add energy. Recently removed dishes are skipped unless nothing else fits; then dishes unsuitable for a member (with warnings); allergens never.
- **Stored Kho match:** each chosen dish is scored again at its planned portions, so "Có sẵn X/Y" and the missing list match what is cooked.
- **Variety across days:** every path (a day, the week, top-up and swap) looks at the same meal on the saved days up to a week before AND after.
  - First choice: the best Kho-scored dish not used in that meal in the 2 days before or after, and planned at most once more in that meal within the week, so a dish appears at most twice in 7 days.
  - Next: any dish that isn't on the previous or next day.
  - Only when nothing else fits may a dish repeat. Saved menus are never regenerated for this.
- **Saved menus:** menus are generated once (the app does it the first time a day is opened, today or later) and never change by themselves. `khoHash` is still stored, but nothing regenerates from it. Generating a past day is refused (422).
- **Week view:** `POST /generate-days { days, familyId }` generates DAY menus in one request for days that are today or later and have no menu. Past days and existing menus are left alone.
  - **"Tạo lại tuần":** with `replace: true` (the family OWNER, or a user without a family; 403 for other members) today's and later days are generated again with the planner, replacing their menus. Past days never change.
- **Older menus:** saved menus keep working as they are (dishes without `details.servings` are cooked for the menu's people). `POST /:menuId/top-up` is kept for older app versions and returns the menu unchanged (past days 422); the app no longer calls it. The old fixed-count generation ("Số món mỗi bữa" slots: `roleSlots`, `pickMealDishes`, `pickRoleDishes`) was removed.
- **Removing one dish:** `POST /:menuId/items/:itemId/remove`
  - The removal is stored in the dislike history (`RemovedDish`; per family when the caller has one).
  - The server adds ONE replacement with the same meal and role, ranked by Kho score. It excludes dishes already in that day, dishes removed in the last 7 days and hidden dishes.
  - If no catalog dish fits, a stored AI suggestion for that meal fills the slot. This uses the same AI limits, and starts a background generation when the Kho changed. Otherwise the slot stays empty.
  - Calorie-based menus: the meal's portions are sized again for its dishes (catalog or AI dish, same kcal target and rules).
  - Past days can't be edited (422).

## Listing menus

`GET /` (gateway: `/api/menu`) returns the family's active menus (or, without a family, the user's). Add `?from=YYYY-MM-DD&to=YYYY-MM-DD` (at most 62 days) to get only the menus that overlap that range. The Thực đơn tab uses this to load a week or a month grid in one request.

## Foreign dishes (balance rule)

recipe-service marks each dish with a `cuisine`: vietnam (default), western or asian. Non-Vietnamese dishes take part in generation, top-up and swaps with the same Kho, variety, family health and calorie rules, but a day gets at most **1 per meal** and **2 per day** (`FOREIGN_PER_MEAL` / `FOREIGN_PER_DAY` in `kho-suggest.ts`).
- **Generation:** a per-day counter is shared by all meals and passes, so the caps hold for every day of a week menu.
- **Swaps:** the remaining dishes of the day count, and the removed dish does not.
- **AI dishes and recipes without a cuisine:** count as Vietnamese.
- **No UI toggle.**

## "Tuần này còn thiếu" (GET /week-missing)

Missing ingredients for the caller's family, computed on read (`src/services/week-missing.ts`). Nothing is stored or pushed.
- **Which dishes:** menu dishes from today through Sunday (Vietnam days), catalog recipes plus stored AI dishes.
- **Amounts:** scaled once with `portions.ts` to each menu's people (quantity × people / recipe servings), then summed per product: the catalog product by exact normalized name or English alias, else the name. Seasonings (`isSeasoning`) and free-text amounts are left out.
- **Kho:** usable stock is subtracted (quantity > 0; not expired, consumed or discarded; expiry day not before today), matched by `productId`, else name.
- **Units:** recipe lines and Kho rows of a sold product are converted to its sale unit: g / kg / ml / l directly (ml ≈ g for liquids sold by weight), the sale unit through catalog `packGrams` (Bún 1 gói ≈ 500 g), pieces of a kg / pack product through catalog `pieceGrams` (Cà chua 1 quả ≈ 100 g). The missing amount is rounded up to the sale step (kg: 0.1 kg, at least 0.1 and at most 20; other units: whole units).
- **No guessing:** a line with no known conversion (pieces without `pieceGrams`, grams of a pack without `packGrams`) stays in its recipe unit with `unconverted: true` and no `cartQuantity`, and is listed in `unconverted`. Kho stock that cannot be converted is not subtracted (`unitMismatch`).
- **Response:** `{ from, to, count, items: [{ name, quantity, unit, productId, imageUrl, price, discountPercent, saleUnit, saleUnitLabel, cartQuantity, unconverted, unitMismatch }], unconverted: [{ name, productId, recipeUnit, saleUnit }] }`. For sold, converted items `quantity` / `unit` are the sale amount and equal `cartQuantity` / `saleUnit` (what "Thêm vào Giỏ hàng" adds); `cartQuantity` is null when the item isn't sold in Đi chợ or is unconverted.
- **No family:** `count: 0`.

## Internal: recipe usage

`GET /internal/recipes/:recipeId/usage` (x-api-key = `INTERNAL_API_KEY`; the gateway answers 404 for `/internal/*`) returns `{ menuItems, removedDishes }`: saved menu items (any family, past or future) and dislike-history rows with that recipe id. recipe-service calls it before deleting a dish. Saved AI dishes keep their own copy and have no recipe id, so they never count.

`POST /internal/breakfast-today` (same key) with `{ userIds }` (1–500) returns `{ day, items: [{ userId, dishes }] }`: today's (Vietnam day) breakfast dish names of each user's family menu (the day's own menu first, else a covering week / month menu; Lịch order). Users without a family are left out; 503 when family-service can't answer. notification-service uses it for the 07:00 "Chào buổi sáng" push.

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
