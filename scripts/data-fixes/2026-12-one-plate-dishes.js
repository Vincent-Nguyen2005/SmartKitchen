// Data fix 2026-12 "one-plate dishes": three foreign mains already include their side, so the calorie-based planner
// must treat them as complete plates (role mot_mon: no canh, no rice; at most one light same-cuisine side):
//   - "Bò bít tết" (western; with potatoes and salad)       role man → mot_mon
//   - "Cá hồi áp chảo" (western; with broccoli)              role man → mot_mon
//   - "Cà ri gà kiểu Nhật" (asian; "ăn với cơm")            role man → mot_mon, and its rice becomes part of the dish:
//       ingredient "Gạo" 300 g for its 4 servings (75 g raw each), kcal per serving 410 → 655 (+245 = 75 g × 3,25
//       kcal per raw gram, the same rule as the menus' rice), carbs 28 → 86 g (+58 g); the first step becomes "Vo gạo
//       nấu cơm; trong lúc chờ, chặt gà…" (30 min, uses Gạo), so the dish keeps 6 steps.
// The starter seed (services/recipe-service/src/seed/recipes.data.ts) has the same values for new installs.
//
// Run in the recipe-service container:
//   docker compose -p smartkitchen exec -T recipe-service node - < scripts/data-fixes/2026-12-one-plate-dishes.js
// DRY RUN by default; APPLY=1 writes (one transaction). Idempotent: rows already changed are skipped (role not man,
// Gạo already listed, rice step already there). Prints dish names and counts only.
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");
const label = APPLY ? "" : "[dry run] ";
const { PrismaClient } = require("/app/node_modules/.prisma/client-recipe");
const prisma = new PrismaClient();

const PLAIN = ["Bò bít tết", "Cá hồi áp chảo"];
const CURRY = "Cà ri gà kiểu Nhật";
const RICE = { name: "Gạo", quantity: 300, unit: "GRAM" };
const STANDALONE = "Vo gạo, nấu cơm";
/**
 * Steps with the rice cooked in the first step (stored step shape, 6 steps kept). A standalone "Vo gạo, nấu cơm"
 * step from an earlier run of this fix is merged into the step after it.
 */
const withRiceStep = (steps) => {
  const sorted = [...steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).filter((step) => step.instruction !== STANDALONE);
  if (sorted.length === 0) return steps;
  const [first, ...rest] = sorted;
  const ingredients = Array.isArray(first.ingredients) ? first.ingredients : [];
  const merged = {
    ...first,
    instruction: `Vo gạo nấu cơm; trong lúc chờ, ${first.instruction.charAt(0).toLocaleLowerCase("vi")}${first.instruction.slice(1)}`,
    durationSeconds: Math.max(1800, first.durationSeconds ?? 0),
    ingredients: [RICE, ...ingredients.filter((line) => line && line.name !== "Gạo")],
  };
  return [merged, ...rest].map((step, index) => ({ ...step, order: index + 1 }));
};
const riceMerged = (steps) => steps.some((step) => typeof step.instruction === "string" && step.instruction.startsWith("Vo gạo nấu cơm;"));

(async () => {
  const rows = await prisma.recipe.findMany({ where: { name: { in: [...PLAIN, CURRY] } }, select: { id: true, name: true, role: true, ingredients: true, ingredientDetails: true, calories: true, carbs: true, steps: true } });
  const updates = [];
  for (const row of rows) {
    // The curry's rice step (added after the first run of this fix): also for a row whose role was already changed.
    if (row.name === CURRY && row.role !== "man") {
      const steps = Array.isArray(row.steps) ? row.steps : [];
      if (!riceMerged(steps) && steps.length > 0) {
        updates.push({ name: row.name, change: "rice cooked in the first step (\"Vo gạo nấu cơm; …\")", run: () => prisma.recipe.update({ where: { id: row.id }, data: { steps: withRiceStep(steps) } }) });
        continue;
      }
    }
    if (row.role !== "man") { console.log(`${label}${row.name}: role already ${row.role}, skipped`); continue; }
    if (row.name === CURRY) {
      const details = Array.isArray(row.ingredientDetails) ? row.ingredientDetails : [];
      const hasRice = details.some((line) => line && line.name === "Gạo");
      const steps = Array.isArray(row.steps) ? row.steps : [];
      updates.push({ name: row.name, change: hasRice ? "role → mot_mon" : "role → mot_mon, + Gạo 300 g, kcal 410 → 655, carbs 28 → 86, rice in the first step",
        run: () => prisma.recipe.update({ where: { id: row.id }, data: {
          role: "mot_mon",
          ...(hasRice ? {} : {
            ingredientDetails: [...details, RICE],
            ingredients: row.ingredients.includes("Gạo") ? row.ingredients : [...row.ingredients, "Gạo"],
            calories: row.calories === 410 ? 655 : row.calories,
            carbs: row.carbs === 28 ? 86 : row.carbs,
            ...(steps.length > 0 ? { steps: withRiceStep(steps) } : {}),
          }),
        } }) });
    } else {
      updates.push({ name: row.name, change: "role → mot_mon", run: () => prisma.recipe.update({ where: { id: row.id }, data: { role: "mot_mon" } }) });
    }
  }
  const missing = [...PLAIN, CURRY].filter((name) => !rows.some((row) => row.name === name));
  if (missing.length) console.log(`${label}not found (skipped): ${missing.join(", ")}`);
  for (const update of updates) console.log(`${label}${update.name}: ${update.change}`);
  if (APPLY && updates.length) {
    await prisma.$transaction(updates.map((update) => update.run()));
    console.log(`updated ${updates.length} recipes`);
  } else if (!updates.length) {
    console.log(`${label}nothing to change`);
  }
  await prisma.$disconnect();
})().catch(async (error) => { console.log(`error: ${error.message.split("\n").filter(Boolean).pop()}`); await prisma.$disconnect(); process.exit(1); });
