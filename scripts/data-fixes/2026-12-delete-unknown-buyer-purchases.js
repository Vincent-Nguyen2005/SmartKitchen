// Data fix 2026-12 "delete unknown-buyer purchases": removes the "Chi tiêu" purchases whose buyer is unknown
// (buyerUserId NULL), i.e. the ones backfilled by migration 20261214000000_purchases from lines bought before buyers
// were recorded. New purchases always have a buyer.
//
// Only spending data is touched:
// - the Purchase rows with buyerUserId NULL are deleted;
// - their lines are detached: only the spending columns added for "Chi tiêu" are cleared on those cart lines
//   (purchaseId, paidUnitPrice, lineTotal, groupName, unitLabel). Name, quantity, unit, price snapshot, isPurchased,
//   inventoryAppliedAt / inventoryItemId and PurchaseHistory are NOT changed; nothing in Kho (inventory-service) is
//   touched; no cart line is deleted. Prints counts only.
//
// DRY RUN by default. APPLY=1 writes (one transaction):
//   docker compose -p smartkitchen exec -T shopping-list-service node - < scripts/data-fixes/2026-12-delete-unknown-buyer-purchases.js
//   docker compose -p smartkitchen exec -T -e APPLY=1 shopping-list-service node - < scripts/data-fixes/2026-12-delete-unknown-buyer-purchases.js
// Idempotent: a second run finds nothing.
const { PrismaClient } = require("/app/node_modules/.prisma/client-shopping-list");
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");

(async () => {
  const prisma = new PrismaClient();
  try {
    const purchases = await prisma.purchase.findMany({ where: { buyerUserId: null }, select: { id: true } });
    const ids = purchases.map((purchase) => purchase.id);
    const lines = ids.length === 0 ? 0 : await prisma.shoppingItem.count({ where: { purchaseId: { in: ids } } });
    if (!APPLY || ids.length === 0) {
      console.log(`${APPLY ? "" : "[dry run] "}unknown-buyer purchases: ${ids.length} purchase(s) ${APPLY ? "deleted" : "to delete"}, ${lines} line(s) ${APPLY ? "detached" : "to detach"}`);
      return;
    }
    const [detached, deleted] = await prisma.$transaction([
      prisma.shoppingItem.updateMany({
        where: { purchaseId: { in: ids } },
        data: { purchaseId: null, paidUnitPrice: null, lineTotal: null, groupName: null, unitLabel: null },
      }),
      prisma.purchase.deleteMany({ where: { id: { in: ids }, buyerUserId: null } }),
    ]);
    console.log(`unknown-buyer purchases: ${deleted.count} purchase(s) deleted, ${detached.count} line(s) detached`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((error) => { console.log(`error: ${error.message}`); process.exit(1); });
