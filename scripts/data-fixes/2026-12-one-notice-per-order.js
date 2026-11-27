// Data fix 2026-12 "one notice per order": order notices used to be one Thông báo row per order AND status
// (dedupeKey "order:<orderId>:<STATUS>"), so an order showed up to three rows ("đang được giao", "đã giao", ...). Now
// there is one row per order (dedupeKey "order:<orderId>", replaced on each status change). For every order:
// - the newest row is kept (latest status, its read state as it is) and gets the key "order:<orderId>";
// - the older rows of the same order are deleted.
// Rows of other kinds (promotions, system notices) are never touched; nothing is changed in other services.
//
// DRY RUN by default. APPLY=1 writes (one transaction):
//   docker compose -p smartkitchen exec -T notification-service node - < scripts/data-fixes/2026-12-one-notice-per-order.js
//   docker compose -p smartkitchen exec -T -e APPLY=1 notification-service node - < scripts/data-fixes/2026-12-one-notice-per-order.js
// Idempotent: a second run finds nothing. Prints counts only.
const { PrismaClient } = require("/app/node_modules/.prisma/client-notification");
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");
const OLD_KEY = /^order:([^:]+):[A-Z_]+$/;

(async () => {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.notification.findMany({
      where: { dedupeKey: { startsWith: "order:" } },
      select: { id: true, dedupeKey: true, createdAt: true, updatedAt: true },
    });
    const byOrder = new Map();
    for (const row of rows) {
      const old = OLD_KEY.exec(row.dedupeKey);
      const orderId = old ? old[1] : row.dedupeKey.slice("order:".length);
      if (!byOrder.has(orderId)) byOrder.set(orderId, []);
      byOrder.get(orderId).push(row);
    }
    const toDelete = [];
    const toRekey = [];
    for (const [orderId, group] of byOrder) {
      group.sort((left, right) => right.createdAt - left.createdAt || right.updatedAt - left.updatedAt);
      const [keep, ...older] = group;
      toDelete.push(...older.map((row) => row.id));
      if (keep.dedupeKey !== `order:${orderId}`) toRekey.push({ id: keep.id, key: `order:${orderId}` });
    }
    const label = APPLY ? "" : "[dry run] ";
    console.log(`${label}order notices: ${rows.length} row(s) for ${byOrder.size} order(s); ${toDelete.length} older row(s) ${APPLY ? "deleted" : "to delete"}, ${toRekey.length} row(s) ${APPLY ? "re-keyed" : "to re-key"} to one per order`);
    if (!APPLY || (toDelete.length === 0 && toRekey.length === 0)) return;
    // Delete first, so the new keys never collide with an older row of the same order.
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { id: { in: toDelete } } }),
      ...toRekey.map((row) => prisma.notification.update({ where: { id: row.id }, data: { dedupeKey: row.key } })),
    ]);
    console.log("done");
  } finally {
    await prisma.$disconnect();
  }
})().catch((error) => { console.log(`error: ${error.message}`); process.exit(1); });
