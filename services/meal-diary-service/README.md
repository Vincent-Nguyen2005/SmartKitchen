# Meal Diary Service

Owner: Hung. Responsibility: meal entries and diary history APIs.

## Docker: environment, migrations, existing databases

- Environment: `PORT`, `DATABASE_URL`.
- The container runs `prisma migrate deploy` before starting node (the Prisma 5.22.0 CLI ships in the image). If a migration fails the container exits non-zero.
- Existing database that already has the tables but no `_prisma_migrations` (error `P3005`): baseline once with `docker compose -p smartkitchen run --rm --no-deps --entrypoint sh meal-diary-service -c "npx --no-install prisma migrate resolve --applied 20261104120000_create_meal_diary"`, then start the service again. Details: [docs/deploy/self-host.md](../../docs/deploy/self-host.md).
