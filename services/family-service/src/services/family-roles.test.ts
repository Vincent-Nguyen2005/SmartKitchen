import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { FamilyRole, PrismaClient } from ".prisma/client-family";
import { FamilyService, FamilyServiceError } from "./family.service";
import { requireRole } from "../middleware/authorization.middleware";
import { effectiveRole } from "./roles";

const FAMILY = { id: "f1", name: "Home", ownerId: "owner" };
type Row = { id: string; userId: string; familyId: string; role: FamilyRole };

/** A tiny in-memory family: owner, a leftover ADMIN and a member. */
const fixture = () => {
  const members: Row[] = [
    { id: "m-owner", userId: "owner", familyId: "f1", role: FamilyRole.OWNER },
    { id: "m-admin", userId: "admin", familyId: "f1", role: FamilyRole.ADMIN },
    { id: "m-member", userId: "member", familyId: "f1", role: FamilyRole.MEMBER },
  ];
  const updates: Array<{ id: string; role: FamilyRole }> = [];
  const deleted: string[] = [];
  const familyMember = {
    findFirst: async ({ where }: { where: { userId?: string; id?: string } }) => {
      const row = members.find((member) => (where.userId ? member.userId === where.userId : member.id === where.id));
      return row ? { ...row, family: FAMILY } : null;
    },
    update: async ({ where, data }: { where: { id?: string; familyId_userId?: { userId: string } }; data: { role: FamilyRole } }) => {
      const row = members.find((member) => (where.id ? member.id === where.id : member.userId === where.familyId_userId?.userId))!;
      row.role = data.role;
      updates.push({ id: row.id, role: data.role });
      return { ...row };
    },
    delete: async ({ where }: { where: { id: string } }) => { deleted.push(where.id); return {}; },
    create: async ({ data }: { data: Row }) => ({ ...data, id: "m-new" }),
  };
  const prisma = {
    familyMember,
    familyGroup: { updateMany: async () => ({ count: 1 }), findUnique: async () => null },
    familyInvitation: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => data,
      findUnique: async () => ({ id: "inv", familyId: "f1", email: "new@example.com", role: FamilyRole.ADMIN, status: "PENDING", expiresAt: new Date(Date.now() + 60_000) }),
      update: async () => ({}),
    },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => work(prisma),
  } as unknown as PrismaClient;
  return { prisma, members, updates, deleted, service: new FamilyService(prisma) };
};
const rejects = async (work: Promise<unknown>, status: number) => {
  await assert.rejects(work, (error: unknown) => error instanceof FamilyServiceError && error.statusCode === status);
};

test("family roles are owner and member only: a leftover ADMIN counts as MEMBER", () => {
  assert.equal(effectiveRole(FamilyRole.ADMIN), FamilyRole.MEMBER);
  assert.equal(effectiveRole(FamilyRole.OWNER), FamilyRole.OWNER);
  assert.equal(effectiveRole(FamilyRole.MEMBER), FamilyRole.MEMBER);
});

test("setting or inviting with the ADMIN role is rejected with 400", async () => {
  const { service, updates } = fixture();
  await rejects(service.updateMemberRole("owner", "m-member", FamilyRole.ADMIN), 400);
  await rejects(service.invite("owner", "new@example.com", FamilyRole.ADMIN), 400);
  assert.deepEqual(updates, []);
  // MEMBER is still accepted (the owner can turn a leftover ADMIN into a member).
  const updated = await service.updateMemberRole("owner", "m-admin", FamilyRole.MEMBER);
  assert.equal(updated.role, FamilyRole.MEMBER);
});

test("management stays with the owner: a leftover ADMIN gets 403 like any member", async () => {
  const { service, deleted } = fixture();
  await rejects(service.removeMember("admin", "m-member"), 403);
  await rejects(service.regenerateJoinCode("admin"), 403);
  await rejects(service.invite("admin", "new@example.com", FamilyRole.MEMBER), 403);
  await rejects(service.updateMemberRole("admin", "m-member", FamilyRole.MEMBER), 403);
  await rejects(service.transferOwnership("admin", "m-member"), 403);
  await rejects(service.removeMember("member", "m-admin"), 403);
  assert.deepEqual(deleted, []);
  await service.removeMember("owner", "m-member");
  assert.deepEqual(deleted, ["m-member"]);
});

test("transferring ownership makes the previous owner a member (not an admin)", async () => {
  const { service, members } = fixture();
  await service.transferOwnership("owner", "m-member");
  assert.deepEqual(members.map((member) => [member.userId, member.role]), [["owner", "MEMBER"], ["admin", "ADMIN"], ["member", "OWNER"]]);
});

test("an old invitation made for ADMIN joins as a member", async () => {
  const { prisma } = fixture();
  const created: Row[] = [];
  (prisma.familyMember as unknown as { findFirst: () => Promise<null> }).findFirst = async () => null;
  (prisma.familyMember as unknown as { create: (args: { data: Row }) => Promise<Row> }).create = async ({ data }) => { created.push(data); return data; };
  await new FamilyService(prisma).join("new-user", "new@example.com", "invitation-token");
  assert.equal(created[0].role, FamilyRole.MEMBER);
});

test("route guard: a leftover ADMIN is refused on owner-only routes (403); the owner passes", async () => {
  const { prisma } = fixture();
  const app = express();
  app.use((req, _res, next) => { (req as unknown as { authUser: { userId: string } }).authUser = { userId: String(req.headers["x-user"]) }; next(); });
  app.post("/owner-only", requireRole(prisma, [FamilyRole.OWNER]), (_req, res) => { res.json({ ok: true }); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  try {
    const call = (user: string) => fetch(`http://127.0.0.1:${address.port}/owner-only`, { method: "POST", headers: { "x-user": user } }).then((response) => response.status);
    assert.deepEqual([await call("admin"), await call("member"), await call("owner")], [403, 403, 200]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
