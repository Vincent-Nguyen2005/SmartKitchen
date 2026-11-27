// Data fix 2026-12 "delete orphan family": removes the family "Naomi", whose owner (and only member) account no longer
// exists in auth-service, and the little data it left behind. Confirmed by Huy.
//
// Matching rule (family-service step): a family named exactly "Naomi" whose owner account does not exist in
// auth-service AND every member's account is missing too (checked through auth-service's internal profiles call).
// Expected, from the investigation: families 1, members 1, settings 1, Kho items 2, item logs 1, preferences 1. If
// anything else matches or a count differs, nothing is changed and the script says so.
//
// Each service has its own database, so the script runs once per service container and detects which one it is in:
//   family-service        match + counts; deletes the family (members, settings, invitations, QR token cascade)
//   inventory-service     the family's Kho items and their logs
//   notification-service  the missing account's notification preferences
// The family-service step can hand the matched target to the other steps (EMIT_TARGET=1 prints one JSON line for the
// operator to redirect to a file outside the repo, never to the terminal); they take it as TARGET=<that JSON>.
//
// Order (one transaction per service): inventory → notification → family (last, so a failed run can be repeated).
//   docker compose -p smartkitchen exec -T -e EMIT_TARGET=1 family-service node - < scripts/data-fixes/2026-12-delete-orphan-family.js > <scratch>/target.json
//   docker compose -p smartkitchen exec -T family-service node - < scripts/data-fixes/2026-12-delete-orphan-family.js
//   docker compose -p smartkitchen exec -T -e TARGET="$(cat <scratch>/target.json)" inventory-service node - < …
//   docker compose -p smartkitchen exec -T -e TARGET="$(cat <scratch>/target.json)" notification-service node - < …
//   (then the same with -e APPLY=1, in the order inventory → notification → family; then the dry runs again: 0)
// DRY RUN by default; APPLY=1 writes. Idempotent: after it ran, every step finds 0. Prints the family name and counts
// only: never ids, emails or phones.
const fs = require("fs");
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");
const NAME = "Naomi";
const EXPECTED = { families: 1, members: 1, settings: 1, items: 2, logs: 1, preferences: 1 };
const label = APPLY ? "" : "[dry run] ";
const has = (client) => fs.existsSync(`/app/node_modules/.prisma/${client}`);
const fail = (message) => { console.log(`STOPPED, nothing changed: ${message}`); process.exit(1); };

/** Target handed over by the family-service step: { familyId, userIds } (never printed). */
const target = () => {
  if (!process.env.TARGET) fail("TARGET is missing (run the family-service step with EMIT_TARGET=1 first)");
  const value = JSON.parse(process.env.TARGET);
  if (value.familyId === null) return null; // the family step found nothing (already deleted)
  if (typeof value.familyId !== "string" || !Array.isArray(value.userIds) || value.userIds.length === 0) fail("TARGET is not valid");
  return value;
};

async function familyStep() {
  const { PrismaClient } = require("/app/node_modules/.prisma/client-family");
  const prisma = new PrismaClient();
  try {
    const named = await prisma.familyGroup.findMany({ where: { name: NAME }, select: { id: true, name: true, ownerId: true, members: { select: { userId: true } } } });
    const ids = [...new Set(named.flatMap((family) => [family.ownerId, ...family.members.map((member) => member.userId)]))];
    let existing = new Set();
    if (ids.length > 0) {
      const base = (process.env.AUTH_SERVICE_URL || "http://auth-service:4001").replace(/\/+$/, "").replace(/^(?![a-z][a-z0-9+.-]*:\/\/)/i, "http://");
      const response = await fetch(`${base}/internal/admin/users/profiles`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.INTERNAL_API_KEY || "" }, body: JSON.stringify({ ids }) });
      if (!response.ok) fail(`auth-service did not answer the profiles check (HTTP ${response.status})`);
      existing = new Set(((await response.json()).items || []).map((item) => item.id));
    }
    const orphans = named.filter((family) => !existing.has(family.ownerId) && family.members.every((member) => !existing.has(member.userId)));
    if (process.env.EMIT_TARGET === "1") {
      // For the operator's redirect only (one JSON line).
      if (orphans.length > 1) fail(`${orphans.length} families match`);
      const family = orphans[0];
      process.stdout.write(JSON.stringify(family ? { familyId: family.id, userIds: [...new Set([family.ownerId, ...family.members.map((member) => member.userId)])] } : { familyId: null, userIds: [] }));
      return;
    }
    if (orphans.length === 0) {
      console.log(`${label}family-service: 0 families named "${NAME}" without any existing account (${named.length} named "${NAME}" in total); nothing to delete`);
      return;
    }
    const family = orphans[0];
    const counts = {
      families: orphans.length,
      members: family.members.length,
      settings: await prisma.familySettings.count({ where: { familyId: family.id } }),
      invitations: await prisma.familyInvitation.count({ where: { familyId: family.id } }),
      qrTokens: await prisma.familyQrToken.count({ where: { familyId: family.id } }),
    };
    console.log(`${label}family-service: family "${family.name}": ${JSON.stringify(counts)}`);
    if (counts.families !== EXPECTED.families || counts.members !== EXPECTED.members || counts.settings !== EXPECTED.settings || named.length !== 1) {
      fail(`counts differ from the investigation (expected families 1, members 1, settings 1, and exactly one family named "${NAME}")`);
    }
    if (!APPLY) return;
    const deleted = await prisma.$transaction(async (tx) => tx.familyGroup.deleteMany({ where: { id: family.id, name: NAME, ownerId: family.ownerId } }));
    const left = await prisma.familyMember.count({ where: { familyId: family.id } }) + await prisma.familySettings.count({ where: { familyId: family.id } });
    console.log(`family-service: deleted ${deleted.count} family; members / settings left for it: ${left}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function inventoryStep() {
  const value = target();
  if (!value) { console.log(`${label}inventory-service: no target (family already deleted); nothing to do`); return; }
  const { PrismaClient } = require("/app/node_modules/.prisma/client-inventory");
  const prisma = new PrismaClient();
  try {
    const items = await prisma.foodItem.count({ where: { familyId: value.familyId } });
    const logs = await prisma.inventoryLog.count({ where: { item: { familyId: value.familyId } } });
    console.log(`${label}inventory-service: Kho items ${items}, item logs ${logs}`);
    if (items === 0 && logs === 0) return;
    if (items !== EXPECTED.items || logs !== EXPECTED.logs) fail("counts differ from the investigation (expected Kho items 2, item logs 1)");
    if (!APPLY) return;
    const [deletedLogs, deletedItems] = await prisma.$transaction([
      prisma.inventoryLog.deleteMany({ where: { item: { familyId: value.familyId } } }),
      prisma.foodItem.deleteMany({ where: { familyId: value.familyId } }),
    ]);
    console.log(`inventory-service: deleted item logs ${deletedLogs.count}, Kho items ${deletedItems.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function notificationStep() {
  const value = target();
  if (!value) { console.log(`${label}notification-service: no target (family already deleted); nothing to do`); return; }
  const { PrismaClient } = require("/app/node_modules/.prisma/client-notification");
  const prisma = new PrismaClient();
  try {
    const where = { userId: { in: value.userIds } };
    const preferences = await prisma.notificationPreference.count({ where });
    console.log(`${label}notification-service: preferences of the missing account ${preferences}`);
    if (preferences === 0) return;
    if (preferences !== EXPECTED.preferences) fail("counts differ from the investigation (expected preferences 1)");
    if (!APPLY) return;
    const [deleted] = await prisma.$transaction([prisma.notificationPreference.deleteMany({ where })]);
    console.log(`notification-service: deleted preferences ${deleted.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

(async () => {
  if (has("client-family")) return familyStep();
  if (has("client-inventory")) return inventoryStep();
  if (has("client-notification")) return notificationStep();
  fail("run this in family-service, inventory-service or notification-service");
})().catch((error) => { console.log(`error: ${error.message.split("\n").filter(Boolean).pop()}`); process.exit(1); });
