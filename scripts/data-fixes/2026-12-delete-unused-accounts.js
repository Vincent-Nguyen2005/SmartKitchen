// Data fix 2026-12 "delete unused accounts": removes two throwaway accounts found in the account review and confirmed
// by Huy: display names "Test User" and "Đoàn Văn Sáng" (never verified, never signed in, no data).
//
// Matching rule (auth-service step), ALL of: display name exactly one of NAMES, role USER, not verified, no session and
// no refresh token (never signed in). Expected: exactly 2 accounts, one per name. Every other service then checks that
// these accounts have NO data at all (family membership, Kho logs, menus, menu settings, removed dishes, orders as buyer
// or shipper, promotion / order audit rows, notifications, dismissals, device tokens, morning pushes, nutrition and health
// rows, meal diaries, reports, admin audit rows). Only notification preferences (made automatically on a read) count as
// a leftover and are removed. If anything else matches or any data exists, nothing is changed and the script says so.
//
// One run per service container (the script detects which one it is in). The auth-service step hands the matched
// target to the other steps: EMIT_TARGET=1 prints one JSON line for the operator to redirect to a file outside the
// repo (never to the terminal); the other steps take it as TARGET=<that JSON>.
//   docker compose -p smartkitchen exec -T -e EMIT_TARGET=1 auth-service node - < scripts/data-fixes/2026-12-delete-unused-accounts.js > <scratch>/target.json
//   docker compose -p smartkitchen exec -T auth-service node - < …                                (dry run: the match)
//   docker compose -p smartkitchen exec -T -e TARGET="$(cat <scratch>/target.json)" <service> node - < …   (each service: checks)
//   APPLY=1: notification-service (preferences) first, then auth-service last (accounts, sessions, refresh tokens).
// DRY RUN by default; APPLY=1 writes (one transaction per service). Idempotent: afterwards every step finds 0.
// Prints display names and counts only: never emails, phones, ids or tokens.
const fs = require("fs");
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");
const NAMES = ["Test User", "Đoàn Văn Sáng"];
const label = APPLY ? "" : "[dry run] ";
const has = (client) => fs.existsSync(`/app/node_modules/.prisma/${client}`);
const fail = (message) => { console.log(`STOPPED, nothing changed: ${message}`); process.exit(1); };
const target = () => {
  if (!process.env.TARGET) fail("TARGET is missing (run the auth-service step with EMIT_TARGET=1 first)");
  const value = JSON.parse(process.env.TARGET);
  if (!Array.isArray(value.ids)) fail("TARGET is not valid");
  return value.ids;
};
const client = (name) => { const { PrismaClient } = require(`/app/node_modules/.prisma/${name}`); return new PrismaClient(); };
/** Counts per table for the target users; any non-zero count stops everything. */
async function mustBeEmpty(service, prisma, counters) {
  const counts = {};
  for (const [name, count] of Object.entries(counters)) counts[name] = await count();
  console.log(`${label}${service}: ${JSON.stringify(counts)}`);
  const found = Object.entries(counts).filter(([, value]) => value !== 0);
  await prisma.$disconnect();
  if (found.length > 0) fail(`${service} has data for these accounts (${found.map(([name]) => name).join(", ")})`);
}

async function authStep() {
  const prisma = client("client-auth");
  try {
    const named = await prisma.user.findMany({ where: { fullName: { in: NAMES } }, select: { id: true, fullName: true, role: true, isVerified: true, _count: { select: { sessions: true, refreshTokens: true } } } });
    const matched = named.filter((user) => user.role === "USER" && !user.isVerified && user._count.sessions === 0 && user._count.refreshTokens === 0);
    if (process.env.EMIT_TARGET === "1") {
      process.stdout.write(JSON.stringify({ ids: matched.map((user) => user.id) }));
      return;
    }
    const total = await prisma.user.count();
    console.log(`${label}auth-service: ${total} accounts; named ${named.length}; matching every rule ${matched.length}: ${matched.map((user) => user.fullName).join(", ") || "(none)"}`);
    if (matched.length === 0) { console.log(`${label}auth-service: nothing to delete`); return; }
    const oneEach = NAMES.every((name) => matched.filter((user) => user.fullName === name).length === 1);
    if (matched.length !== 2 || named.length !== 2 || !oneEach) fail("expected exactly one matching account per name and no other account with these names");
    if (!APPLY) return;
    const ids = matched.map((user) => user.id);
    const [, , deleted] = await prisma.$transaction([
      prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }),
      prisma.session.deleteMany({ where: { userId: { in: ids } } }),
      // OTP and reset codes live on the user row and go with it; the rule is checked again in the WHERE.
      prisma.user.deleteMany({ where: { id: { in: ids }, fullName: { in: NAMES }, role: "USER", isVerified: false } }),
    ]);
    console.log(`auth-service: deleted ${deleted.count} accounts; accounts now ${await prisma.user.count()}`);
  } finally {
    await prisma.$disconnect();
  }
}

const steps = {
  "client-family": async (ids) => { const p = client("client-family"); await mustBeEmpty("family-service", p, { memberships: () => p.familyMember.count({ where: { userId: { in: ids } } }), ownedFamilies: () => p.familyGroup.count({ where: { ownerId: { in: ids } } }) }); },
  "client-inventory": async (ids) => { const p = client("client-inventory"); await mustBeEmpty("inventory-service", p, { khoLogs: () => p.inventoryLog.count({ where: { createdBy: { in: ids } } }) }); },
  "client-menu": async (ids) => { const p = client("client-menu"); await mustBeEmpty("menu-service", p, { menus: () => p.menu.count({ where: { userId: { in: ids } } }), menuSettings: () => p.menuSettings.count({ where: { userId: { in: ids } } }), removedDishes: () => p.removedDish.count({ where: { userId: { in: ids } } }) }); },
  "client-shopping-list": async (ids) => { const p = client("client-shopping-list"); await mustBeEmpty("shopping-list-service", p, { ordersAsBuyer: () => p.purchase.count({ where: { buyerUserId: { in: ids } } }), ordersAsShipper: () => p.purchase.count({ where: { shipperId: { in: ids } } }), promotionAudit: () => p.promotionAuditLog.count({ where: { adminUserId: { in: ids } } }), orderAudit: () => p.orderAuditLog.count({ where: { adminUserId: { in: ids } } }) }); },
  "client-nutrition": async (ids) => { const p = client("client-nutrition"); await mustBeEmpty("nutrition-service", p, { profiles: () => p.nutritionProfile.count({ where: { userId: { in: ids } } }), mealLogs: () => p.mealLog.count({ where: { userId: { in: ids } } }), allergies: () => p.userAllergy.count({ where: { userId: { in: ids } } }), conditions: () => p.userHealthCondition.count({ where: { userId: { in: ids } } }), custom: () => p.userHealthCustom.count({ where: { userId: { in: ids } } }) }); },
  "client-meal-diary": async (ids) => { const p = client("client-meal-diary"); await mustBeEmpty("meal-diary-service", p, { diaries: () => p.mealDiary.count({ where: { userId: { in: ids } } }) }); },
  "client-admin": async (ids) => { const p = client("client-admin"); await mustBeEmpty("admin-service", p, { reports: () => p.accountReport.count({ where: { OR: [{ reporterUserId: { in: ids } }, { reportedUserId: { in: ids } }] } }), auditRows: () => p.auditLog.count({ where: { OR: [{ adminUserId: { in: ids } }, { targetId: { in: ids } }] } }) }); },
  "client-notification": async (ids) => {
    const p = client("client-notification");
    const preferences = await p.notificationPreference.count({ where: { userId: { in: ids } } });
    const counts = {
      notifications: await p.notification.count({ where: { userId: { in: ids } } }), dismissals: await p.notificationDismissal.count({ where: { userId: { in: ids } } }),
      deviceTokens: await p.deviceToken.count({ where: { userId: { in: ids } } }), morningPushes: await p.morningPush.count({ where: { userId: { in: ids } } }),
    };
    console.log(`${label}notification-service: ${JSON.stringify(counts)}; leftover preferences ${preferences}`);
    if (Object.values(counts).some((value) => value !== 0)) { await p.$disconnect(); fail("notification-service has data for these accounts"); }
    if (APPLY && preferences > 0) {
      const [deleted] = await p.$transaction([p.notificationPreference.deleteMany({ where: { userId: { in: ids } } })]);
      console.log(`notification-service: deleted ${deleted.count} leftover preferences`);
    }
    await p.$disconnect();
  },
};

(async () => {
  if (has("client-auth")) return authStep();
  const name = Object.keys(steps).find(has);
  if (!name) fail("run this in auth, family, inventory, menu, shopping-list, nutrition, meal-diary, admin or notification service");
  const ids = target();
  if (ids.length === 0) { console.log(`${label}${name.replace("client-", "")}: no target (accounts already deleted); nothing to do`); return; }
  await steps[name](ids);
})().catch((error) => { console.log(`error: ${error.message.split("\n").filter(Boolean).pop()}`); process.exit(1); });
