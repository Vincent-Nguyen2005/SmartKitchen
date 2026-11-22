# Nutrition Service

Owner: Hung. Responsibility: nutritional information and dietary analysis APIs.

## Nutrition profile

The service stores a user's profile in its own PostgreSQL database. `userId` is a unique UUID copied from the authenticated identity; Auth Service owns the User table in another database, so there is intentionally no cross-database foreign key.

Apply the schema and generate the Prisma Client from the repository root:

```powershell
pnpm --filter nutrition-service prisma:migrate -- --name add_nutrition_profile
pnpm --filter nutrition-service prisma:generate
```

The gateway exposes `GET`, `POST`, and `PUT /api/nutrition-profile`. Requests must include an `X-User-Id` UUID. The trusted authentication layer must validate the caller and set or overwrite this header; the nutrition service does not treat a client-supplied identity as authentication.

- `GET` returns the saved profile, rounded BMR/TDEE, or `404` if no profile exists.
- `POST` creates a profile and returns `409` if one already exists.
- `PUT` creates or updates the caller's profile (upsert).

POST/PUT JSON body:

```json
{
  "height": 168,
  "weight": 62.5,
  "age": 29,
  "gender": "FEMALE",
  "activityLevel": "MODERATELY_ACTIVE"
}
```

The calculation uses Mifflin-St Jeor and the activity factors declared in `src/utils/nutrition-calculator.ts`. Input measurements must be positive and within the API's sanity bounds.

## Docker: environment, migrations, existing databases

- Environment: `PORT`, `DATABASE_URL`; `MEAL_DIARY_SERVICE_URL` (daily stats) and `RECIPE_SERVICE_URL` (suggestions).
- The container runs `prisma migrate deploy` before starting node (the Prisma 5.22.0 CLI ships in the image). If a migration fails the container exits non-zero.
- Existing database that already has the tables but no `_prisma_migrations` (error `P3005`): baseline once with `docker compose -p smartkitchen run --rm --no-deps --entrypoint sh nutrition-service -c "npx --no-install prisma migrate resolve --applied 20261002000000_add_nutrition_profile"`, then start the service again. Details: [docs/deploy/self-host.md](../../docs/deploy/self-host.md).

## Birth date, catalogs and custom health tags

- **Birth date:** the profile accepts `birthDate` (YYYY-MM-DD, from 1900-01-01 to today, age 1–130). The service computes `age` from it in Vietnam time and stores both. On read, a stored birth date gives the current age. Older clients may still send `age` only, and profiles without a birth date keep working.
- **Catalogs:** at start the service adds the common Vietnamese allergies (15) and health conditions (12) from `src/seed/health-catalog.ts`. Only missing names are added (`createMany` with skipDuplicates), so existing rows, including the older English ones, are never changed or deleted. The names match the recipe allergen and contraindication tags, so the suggestion filter can use them.
- **Old English entries:** after seeding, `src/seed/english-catalog-cleanup.ts` removes the 11 English entries from the first seed migration (Milk, Egg, Peanut, Tree nut, Soy, Wheat, Fish, Shellfish, Sesame, Diabetes, Hypertension).
  - Each user's selection moves to the Vietnamese equivalent (Sữa, Trứng, Đậu phộng, Hạt cây, Đậu nành, Gluten, Cá, Hải sản, Mè, Tiểu đường, Cao huyết áp), skipped when the user already has it.
  - Without an equivalent, the selection becomes the user's custom tag.
  - The English entry is then deleted. It runs on every start and does nothing once they're gone; the seed never adds English names.
- **Custom tags:** `POST /user/profile/health` also takes `customAllergies` and `customConditions` (free text, at most 30 each, 80 characters). A typed name equal to a catalog item, ignoring accents and case, becomes that selection; the rest is stored in `UserHealthCustom` and returned by `GET /user/profile/health`. Custom items are not used by the suggestion filter.
- **Tests:** `node ../../node_modules/vitest/vitest.mjs run`

