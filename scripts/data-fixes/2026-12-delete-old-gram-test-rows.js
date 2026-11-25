// Data fix 2026-12 "delete old gram test rows": removes the three Kho test rows bought in Đi chợ on 21/11/2026 (UTC;
// about 02:00 on 22/11 in Vietnam),
// when Cà rốt / Cà chua / Bắp cải were still listed by the gram and the cart's default 1 meant "1 g". They are bought
// rows, which the app can no longer delete (only the storage place can change), so this runs in inventory-service.
//
// A row is touched only if ALL of these hold: name Cà rốt, Cà chua or Bắp cải (exact, case-insensitive), origin
// PURCHASE, unit GRAM, quantity exactly 1, bought on the UTC day 21/11/2026, not deleted yet. It is
// soft-deleted like a Kho delete (deletedAt set, photo link cleared); its logs stay. More than 3 matches -> nothing
// is changed. Prints counts only.
//
// DRY RUN by default. APPLY=1 writes:
//   docker compose -p smartkitchen exec -T inventory-service node - < scripts/data-fixes/2026-12-delete-old-gram-test-rows.js
//   docker compose -p smartkitchen exec -T -e APPLY=1 inventory-service node - < scripts/data-fixes/2026-12-delete-old-gram-test-rows.js
// Idempotent: a second run finds nothing to delete.
const { PrismaClient } = require("/app/node_modules/.prisma/client-inventory");
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");
const NAMES = ["Cà rốt", "Cà chua", "Bắp cải"];
// The UTC day 21/11/2026 (the purchase was at ~19:00 UTC, 22/11 ~02:00 in Vietnam).
const DAY_START = new Date("2026-11-21T00:00:00.000Z");
const DAY_END = new Date("2026-11-22T00:00:00.000Z");
const MAX_ROWS = 3;

(async () => {
  const prisma = new PrismaClient();
  try {
    const where = {
      deletedAt: null,
      origin: "PURCHASE",
      unit: "GRAM",
      quantity: 1,
      purchasedAt: { gte: DAY_START, lt: DAY_END },
      OR: NAMES.map((name) => ({ name: { equals: name, mode: "insensitive" } })),
    };
    const rows = await prisma.foodItem.findMany({ where, select: { id: true } });
    if (rows.length > MAX_ROWS) {
      console.log(`${rows.length} matching rows (more than ${MAX_ROWS}): nothing changed, check the data first`);
      process.exitCode = 1;
      return;
    }
    if (!APPLY) { console.log(`[dry run] old gram test rows: ${rows.length} to delete`); return; }
    const result = await prisma.foodItem.updateMany({ where: { ...where, id: { in: rows.map((row) => row.id) } }, data: { deletedAt: new Date(), imageUrl: null } });
    console.log(`old gram test rows: ${result.count} deleted`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((error) => { console.log(`error: ${error.message}`); process.exit(1); });
