// Data fix 2026-12 "family admin to member": family roles are now only the owner (chủ gia đình) and members
// (thành viên). Every family member whose role is still ADMIN becomes MEMBER, and pending invitations made for ADMIN
// become MEMBER invitations. Owners are never touched; the platform admin role ("Quản trị", auth-service) is unrelated.
// family-service already treats a leftover ADMIN as MEMBER, so this only cleans the stored value. Prints counts only.
//
// DRY RUN by default. APPLY=1 writes:
//   docker compose -p smartkitchen exec -T family-service node - < scripts/data-fixes/2026-12-family-admin-to-member.js
//   docker compose -p smartkitchen exec -T -e APPLY=1 family-service node - < scripts/data-fixes/2026-12-family-admin-to-member.js
// Idempotent: a second run finds nothing to change.
const { PrismaClient } = require("/app/node_modules/.prisma/client-family");
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");

(async () => {
  const prisma = new PrismaClient();
  try {
    const memberWhere = { role: "ADMIN" };
    const inviteWhere = { role: "ADMIN", status: "PENDING" };
    const admins = await prisma.familyMember.count({ where: memberWhere });
    const families = (await prisma.familyMember.findMany({ where: memberWhere, distinct: ["familyId"], select: { familyId: true } })).length;
    const invitations = await prisma.familyInvitation.count({ where: inviteWhere });
    if (APPLY && (admins > 0 || invitations > 0)) {
      const [members, invites] = await prisma.$transaction([
        prisma.familyMember.updateMany({ where: memberWhere, data: { role: "MEMBER" } }),
        prisma.familyInvitation.updateMany({ where: inviteWhere, data: { role: "MEMBER" } }),
      ]);
      console.log(`family admins: ${members.count} member(s) in ${families} famil${families === 1 ? "y" : "ies"} changed ADMIN -> MEMBER, ${invites.count} pending invitation(s) changed`);
    } else {
      console.log(`${APPLY ? "" : "[dry run] "}family admins: ${admins} member(s) in ${families} famil${families === 1 ? "y" : "ies"} ${APPLY ? "changed" : "to change"} ADMIN -> MEMBER, ${invitations} pending invitation(s) ${APPLY ? "changed" : "to change"}`);
    }
  } finally {
    await prisma.$disconnect();
  }
})().catch((error) => { console.log(`error: ${error.message}`); process.exit(1); });
