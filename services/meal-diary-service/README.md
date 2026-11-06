# Meal Diary Service

Owner: Hung. Responsibility: meal entries and diary history APIs.

The service stores user-owned daily diaries and their items in its own database.
Apply the Prisma migration before starting the service:

```sh
pnpm --filter meal-diary-service prisma:migrate
```

Through the Gateway, `POST /api/meal-diary/meals/log` creates a diary entry,
`GET /api/meal-diary/meals/history?date=YYYY-MM-DD` returns that day's meals,
and `GET /api/meal-diary/daily-summary?date=YYYY-MM-DD` returns summed calories
and macros. Requests require the authenticated user's `X-User-Id`.