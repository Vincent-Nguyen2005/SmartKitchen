// Data fix 2026-12 "more món mặn": the calorie-based planner needs enough Vietnamese rice-meal mains for a varied week
// (12 were left after the khai vị fix). Adds 8 common món mặn from the starter seed
// (services/recipe-service/src/seed/recipes.data.ts, steps / seasonings in the seed's other files):
//   Cá basa kho tiêu, Gà chiên nước mắm, Bò xào hành tây, Mực xào chua ngọt, Tôm rang thịt, Thịt rang cháy cạnh,
//   Cá thu sốt cà chua, Trứng chiên thịt
// (role man, cuisine vietnam, lunch / dinner, 4 servings, macros matching kcal, ingredients that are catalog products,
// seasonings flagged, 4–5 steps with timers). No image: an admin can add photos later.
// The recipe-service start does the same for any missing starter dish; this script lets it run without a restart.
//
// Run in the recipe-service container (rebuilt with the new seed):
//   docker compose -p smartkitchen exec -T recipe-service node - < scripts/data-fixes/2026-12-more-mon-man.js
// DRY RUN by default; APPLY=1 writes. Idempotent: dishes already present (or deleted by an admin for good) are
// skipped; the fill steps only fill empty fields. Prints dish names and counts only.
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");
const label = APPLY ? "" : "[dry run] ";
const { PrismaClient } = require("/app/node_modules/.prisma/client-recipe");
const { seedRecipes } = require("/app/dist/seed/recipes.data.js");
const { seedMissingRecipes, fillMissingSteps, fillMissingRoles, fillSeasonings } = require("/app/dist/seed/seed-recipes.js");
const { fillHealthTags } = require("/app/dist/seed/health-tags.js");
const prisma = new PrismaClient();
const NAMES = ["Cá basa kho tiêu", "Gà chiên nước mắm", "Bò xào hành tây", "Mực xào chua ngọt", "Tôm rang thịt", "Thịt rang cháy cạnh", "Cá thu sốt cà chua", "Trứng chiên thịt"];
const key = (name) => name.trim().toLocaleLowerCase("vi");

(async () => {
  const dishes = seedRecipes.filter((recipe) => NAMES.includes(recipe.name));
  if (dishes.length !== NAMES.length) { console.log(`STOPPED: the recipe-service image does not have the new seed (${dishes.length}/${NAMES.length}); rebuild it first`); process.exit(1); }
  const present = new Set((await prisma.recipe.findMany({ select: { name: true } })).map((row) => key(row.name)));
  const deleted = new Set((await prisma.deletedStarterRecipe.findMany({ select: { nameKey: true } })).map((row) => row.nameKey));
  const missing = dishes.filter((recipe) => !present.has(key(recipe.name)) && !deleted.has(key(recipe.name)));
  for (const recipe of dishes.filter((entry) => !missing.includes(entry))) console.log(`${label}${recipe.name}: ${present.has(key(recipe.name)) ? "already in the catalog" : "deleted by an admin"}, skipped`);
  for (const recipe of missing) console.log(`${label}${recipe.name}: add`);
  if (!APPLY || missing.length === 0) { if (!missing.length) console.log(`${label}nothing to add`); await prisma.$disconnect(); return; }
  const created = await seedMissingRecipes(prisma, missing);
  const steps = await fillMissingSteps(prisma, missing);
  const roles = await fillMissingRoles(prisma, missing);
  const seasonings = await fillSeasonings(prisma, missing);
  const tags = await fillHealthTags(prisma, missing);
  console.log(`added ${created} recipes (steps ${steps}, roles ${roles}, seasonings ${seasonings}, health tags ${tags.length})`);
  await prisma.$disconnect();
})().catch(async (error) => { console.log(`error: ${error.message.split("\n").filter(Boolean).pop()}`); await prisma.$disconnect(); process.exit(1); });
