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

## Health declarations

The gateway exposes `GET /api/nutrition-profile/allergies` and `GET /api/nutrition-profile/health-conditions` for the available master data. `GET` and `POST /api/nutrition-profile/user/profile/health` read and replace the caller's saved selections. These user-specific requests require the same trusted `X-User-Id` UUID header.

POST JSON body:

```json
{
  "allergyIds": [],
  "conditionIds": []
}
```

## Meal logs

`POST /api/nutrition-profile/meals/log` creates a meal and its items. `GET /api/nutrition-profile/meals/history` accepts either `?date=YYYY-MM-DD` or `?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`; the end date is inclusive and dates are interpreted in UTC. The response includes meal items and daily calorie/macronutrient totals. `DELETE /api/nutrition-profile/meals/:id` removes one of the caller's logs. All meal endpoints require the trusted `X-User-Id` UUID header.

Meal log POST JSON body:

```json
{
  "mealType": "LUNCH",
  "source": "HOME",
  "items": [{ "foodName": "Rice", "calories": 200, "quantity": 1 }]
}
```
