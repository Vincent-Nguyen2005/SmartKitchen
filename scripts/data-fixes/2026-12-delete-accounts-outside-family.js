// Data fix 2026-12 "delete accounts outside the family": Huy keeps only the members of the family "love", the ADMIN
// account and the SHIPPER account. The three other accounts from the account review ("nir", "Le Vu Hung", "Trần Thành
// Nhân") are deleted.
//
// Matching rule, ALL of: role USER, not a member (or owner) of any family, and NO data in any service (family, Kho logs,
// menus, menu settings, removed dishes, orders as buyer or shipper, promotion / order audit rows, notifications,
// dismissals, device tokens, morning pushes, nutrition and health rows, meal diaries, reports, admin audit rows). Only
// notification preferences (made automatically on a read) count as a leftover and are removed. Expected: exactly the
// three display names in NAMES, one account each. If anything else matches or any data exists, nothing is changed.
//
// One run per service container (the script detects which one it is in). Hand-off through files OUTSIDE the repo
// (never printed to the terminal):
//   1. auth-service, EMIT_CANDIDATES=1  → candidates.json  (every role-USER account)
//        docker compose -p smartkitchen exec -T -e EMIT_CANDIDATES=1 auth-service node - < <this file> > <scratch>/candidates.json
//   2. family-service, CANDIDATES=…, EMIT_TARGET=1 → target.json  (the candidates in no family)
//        docker compose -p smartkitchen exec -T -e CANDIDATES="$(cat <scratch>/candidates.json)" -e EMIT_TARGET=1 family-service node - < … > <scratch>/target.json
//   3. auth-service, TARGET=…  (dry run: the names must be exactly NAMES)
//   4. every other service with TARGET=… (and family-service again): the no-data checks
//   APPLY=1: notification-service (preferences) first, then auth-service last (accounts, sessions, refresh tokens).
// DRY RUN by default; APPLY=1 writes (one transaction per service). Idempotent: afterwards step 2 finds 0.
// Prints display names, the family name "love" and counts only: never emails, phones, ids or tokens.
const fs = require("fs");
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");
const NAMES = ["nir", "Le Vu Hung", "Trần Thành Nhân"];
const KEEP_FAMILY = "love";
const label = APPLY ? "" : "[dry run] ";
const has = (client) => fs.existsSync(`/app/node_modules/.prisma/${client}`);
const fail = (message) => { console.log(`STOPPED, nothing changed: ${message}`); process.exit(1); };
const idsFrom = (variable, hint) => {
  if (!process.env[variable]) fail(`${variable} is missing (${hint})`);
  const value = JSON.parse(process.env[variable]);
  if (!Array.isArray(value.ids) || !value.ids.every((id) => typeof id === "string")) fail(`${variable} is not valid`);
  return value.ids;
};
const target = () => idsFrom("TARGET", "run the family-service step with EMIT_TARGET=1 first");
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

async function roleCounts(prisma) {
  const rows = await prisma.user.groupBy({ by: ["role"], _count: { _all: true } });
  return Object.fromEntries(rows.map((row) => [row.role, row._count._all]));
}

async function authStep() {
  const prisma = client("client-auth");
  try {
    if (process.env.EMIT_CANDIDATES === "1") {
      const users = await prisma.user.findMany({ where: { role: "USER" }, select: { id: true } });
      process.stdout.write(JSON.stringify({ ids: users.map((user) => user.id) }));
      return;
    }
    const total = await prisma.user.count();
    console.log(`${label}auth-service: ${total} accounts ${JSON.stringify(await roleCounts(prisma))}`);
    if (!process.env.TARGET) { console.log(`${label}auth-service: no TARGET given (counts only)`); return; }
    const ids = target();
    if (ids.length === 0) { console.log(`${label}auth-service: no account outside a family; nothing to delete`); return; }
    const matched = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, role: true, _count: { select: { sessions: true, refreshTokens: true } } } });
    console.log(`${label}auth-service: outside every family ${matched.length}: ${matched.map((user) => user.fullName ?? "(no name)").join(", ")}; sessions ${matched.reduce((sum, user) => sum + user._count.sessions, 0)}, refresh tokens ${matched.reduce((sum, user) => sum + user._count.refreshTokens, 0)}`);
    const oneEach = NAMES.every((name) => matched.filter((user) => user.fullName === name).length === 1);
    if (matched.length !== NAMES.length || ids.length !== NAMES.length || !oneEach || matched.some((user) => user.role !== "USER")) {
      fail(`expected exactly ${NAMES.join(", ")} (role USER, one each) outside every family`);
    }
    if (!APPLY) return;
    const [tokens, sessions, deleted] = await prisma.$transaction([
      prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }),
      prisma.session.deleteMany({ where: { userId: { in: ids } } }),
      // OTP and reset codes live on the user row and go with it; the rule is checked again in the WHERE.
      prisma.user.deleteMany({ where: { id: { in: ids }, fullName: { in: NAMES }, role: "USER" } }),
    ]);
    console.log(`auth-service: deleted ${deleted.count} accounts, ${sessions.count} sessions, ${tokens.count} refresh tokens; accounts now ${await prisma.user.count()} ${JSON.stringify(await roleCounts(prisma))}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function familyStep() {
  const p = client("client-family");
  try {
    // The hand-off output must be the JSON line only.
    if (process.env.EMIT_TARGET !== "1") {
      const keep = await p.familyGroup.findMany({ where: { name: KEEP_FAMILY }, select: { _count: { select: { members: true } } } });
      console.log(`${label}family-service: ${await p.familyGroup.count()} families; "${KEEP_FAMILY}": ${keep.length} family, ${keep.map((family) => family._count.members).join(", ") || 0} members`);
    }
    if (process.env.CANDIDATES) {
      const candidates = idsFrom("CANDIDATES", "run the auth-service step with EMIT_CANDIDATES=1 first");
      const members = new Set((await p.familyMember.findMany({ where: { userId: { in: candidates } }, select: { userId: true } })).map((row) => row.userId));
      const owners = new Set((await p.familyGroup.findMany({ where: { ownerId: { in: candidates } }, select: { ownerId: true } })).map((row) => row.ownerId));
      const outside = candidates.filter((id) => !members.has(id) && !owners.has(id));
      if (process.env.EMIT_TARGET === "1") { await p.$disconnect(); process.stdout.write(JSON.stringify({ ids: outside })); process.exit(0); }
      console.log(`${label}family-service: role-USER accounts ${candidates.length}, in a family ${candidates.length - outside.length}, outside every family ${outside.length}`);
      return;
    }
    const ids = target();
    if (ids.length === 0) { console.log(`${label}family-service: no target; nothing to do`); return; }
    await mustBeEmpty("family-service", p, { memberships: () => p.familyMember.count({ where: { userId: { in: ids } } }), ownedFamilies: () => p.familyGroup.count({ where: { ownerId: { in: ids } } }) });
  } finally {
    await p.$disconnect();
  }
}

const steps = {
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
  if (has("client-family")) return familyStep();
  const name = Object.keys(steps).find(has);
  if (!name) fail("run this in auth, family, inventory, menu, shopping-list, nutrition, meal-diary, admin or notification service");
  const ids = target();
  if (ids.length === 0) { console.log(`${label}${name.replace("client-", "")}: no target (accounts already deleted); nothing to do`); return; }
  await steps[name](ids);
})().catch((error) => { console.log(`error: ${error.message.split("\n").filter(Boolean).pop()}`); process.exit(1); });
