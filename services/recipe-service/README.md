# Recipe Service

Owner: Cuong. Responsibility: recipe catalog and recipe authoring APIs.

The Prisma catalog stores nutrition values per serving, ingredient names,
allergen tags, and health-condition contraindication tags. Apply the migration
before starting the service:

```sh
pnpm --filter recipe-service prisma:migrate
```

`GET /api/recipe` (through the Gateway) returns active catalog entries. Recipe
allergen and contraindication tags should use the same names as the nutrition
service's allergy and health-condition catalog; suggestions exclude exact
normalized matches. Populate the catalog with reviewed ingredient and tag data
before relying on suggestions. An empty catalog returns an empty suggestion list.