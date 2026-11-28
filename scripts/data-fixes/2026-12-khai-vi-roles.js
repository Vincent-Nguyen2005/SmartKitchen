// Data fix 2026-12 "khai vị roles": appetizers / rolls / small side dishes that were marked as món mặn (role man), so
// the calorie-based planner served them as a rice meal's main. They become role khai_vi (a side, never a main):
//   - "Gỏi cuốn tôm thịt"     (rice-paper rolls with shrimp, pork, bún and lettuce)
//   - "Trứng cuộn kiểu Hàn"   (Korean rolled omelette, a banchan side dish)
// Catalog review (all 14 role-man recipes): the other 12 are real mains (kho / rim / chiên / luộc / sốt dishes).
// The starter seed (services/recipe-service/src/seed/recipes.data.ts) has the same roles for new installs.
//
// Run in the recipe-service container (rebuilt with role khai_vi):
//   docker compose -p smartkitchen exec -T recipe-service node - < scripts/data-fixes/2026-12-khai-vi-roles.js
// DRY RUN by default; APPLY=1 writes (one transaction). Idempotent: only rows still marked man change. Prints dish
// names and counts only.
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");
const label = APPLY ? "" : "[dry run] ";
const { PrismaClient } = require("/app/node_modules/.prisma/client-recipe");
const prisma = new PrismaClient();
const NAMES = ["Gỏi cuốn tôm thịt", "Trứng cuộn kiểu Hàn"];

(async () => {
  const rows = await prisma.recipe.findMany({ where: { name: { in: NAMES } }, select: { id: true, name: true, role: true } });
  const missing = NAMES.filter((name) => !rows.some((row) => row.name === name));
  if (missing.length) console.log(`${label}not found (skipped): ${missing.join(", ")}`);
  const todo = rows.filter((row) => row.role === "man");
  for (const row of rows.filter((entry) => entry.role !== "man")) console.log(`${label}${row.name}: role already ${row.role}, skipped`);
  for (const row of todo) console.log(`${label}${row.name}: role man → khai_vi`);
  if (APPLY && todo.length) {
    const [result] = await prisma.$transaction([prisma.recipe.updateMany({ where: { id: { in: todo.map((row) => row.id) }, role: "man" }, data: { role: "khai_vi" } })]);
    console.log(`updated ${result.count} recipes`);
  } else if (!todo.length) {
    console.log(`${label}nothing to change`);
  }
  await prisma.$disconnect();
})().catch(async (error) => { console.log(`error: ${error.message.split("\n").filter(Boolean).pop()}`); await prisma.$disconnect(); process.exit(1); });
