// Data fix 2026-12 "Kho unit labels": fills FoodItem.unitLabel (new column, migration 20261210000000_item_unit_label)
// for Kho rows linked to a catalog product sold by the piece, so they show "2 quả" / "1 bìa" instead of a combined
// label. The word comes from the catalog product's unitLabel (Quản trị › Nguyên liệu), read from admin-service the
// same way inventory-service reads it for photo recognition.
//
// A row is touched only if ALL of these hold: not deleted, productId set, unit PIECE, unitLabel still null, and the
// linked product's word is "quả", "trái", "bìa" or "nải" ("cái" is PIECE's own word and stays null). Prints counts only.
//
// DRY RUN by default. APPLY=1 writes:
//   docker compose -p smartkitchen exec -T inventory-service node - < scripts/data-fixes/2026-12-kho-unit-labels.js
//   docker compose -p smartkitchen exec -T -e APPLY=1 inventory-service node - < scripts/data-fixes/2026-12-kho-unit-labels.js
// Idempotent: a second run finds nothing to fill (only rows whose unitLabel is still null are updated).
const { PrismaClient } = require("/app/node_modules/.prisma/client-inventory");
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");
const WORDS = ["quả", "trái", "bìa", "nải"];
const ADMIN = (process.env.ADMIN_SERVICE_URL || "http://admin-service:4011").replace(/\/+$/, "");

async function catalogWords() {
  const words = new Map();
  for (let page = 1; page <= 20; page += 1) {
    // admin-service trusts x-user-id on the private network (any caller id is enough for the read-only catalog).
    const response = await fetch(`${ADMIN}/catalog/ingredients?page=${page}&limit=50`, { headers: { "x-user-id": "data-fix" } });
    if (!response.ok) throw new Error(`catalog answered ${response.status}`);
    const body = await response.json();
    for (const item of body.items ?? []) {
      const word = typeof item.unitLabel === "string" ? item.unitLabel.trim().toLowerCase() : "";
      if (item.unit === "PIECE" && WORDS.includes(word)) words.set(item.id, word);
    }
    if (page >= (body.totalPages ?? 1)) break;
  }
  return words;
}

(async () => {
  const prisma = new PrismaClient();
  try {
    const words = await catalogWords();
    const rows = await prisma.foodItem.findMany({
      where: { deletedAt: null, unit: "PIECE", unitLabel: null, productId: { not: null } },
      select: { id: true, productId: true },
    });
    const todo = rows.filter((row) => words.has(row.productId));
    const byWord = {};
    for (const row of todo) byWord[words.get(row.productId)] = (byWord[words.get(row.productId)] ?? 0) + 1;
    const summary = Object.entries(byWord).map(([word, count]) => `${word}: ${count}`).join(", ") || "none";
    if (!APPLY) { console.log(`[dry run] Kho unit labels: ${todo.length} to fill (${summary}); ${rows.length - todo.length} linked PIECE rows keep "cái"`); return; }
    let filled = 0;
    for (const row of todo) {
      const result = await prisma.foodItem.updateMany({ where: { id: row.id, unitLabel: null, unit: "PIECE" }, data: { unitLabel: words.get(row.productId) } });
      filled += result.count;
    }
    console.log(`Kho unit labels: ${filled} filled (${summary})`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((error) => { console.log(`error: ${error.message}`); process.exit(1); });
