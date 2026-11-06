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
