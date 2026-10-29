CREATE TYPE "FamilyRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED');

CREATE TABLE "FamilyGroup" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "ownerId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FamilyGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FamilyMember" (
  "id" UUID NOT NULL,
  "familyId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "FamilyRole" NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FamilyInvitation" (
  "id" UUID NOT NULL,
  "familyId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "role" "FamilyRole" NOT NULL DEFAULT 'MEMBER',
  "token" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FamilyInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FamilyGroup_code_key" ON "FamilyGroup"("code");
CREATE INDEX "FamilyGroup_ownerId_idx" ON "FamilyGroup"("ownerId");
CREATE UNIQUE INDEX "FamilyMember_familyId_userId_key" ON "FamilyMember"("familyId", "userId");
CREATE INDEX "FamilyMember_userId_idx" ON "FamilyMember"("userId");
CREATE UNIQUE INDEX "FamilyInvitation_token_key" ON "FamilyInvitation"("token");
CREATE INDEX "FamilyInvitation_familyId_email_status_idx" ON "FamilyInvitation"("familyId", "email", "status");
CREATE INDEX "FamilyInvitation_expiresAt_idx" ON "FamilyInvitation"("expiresAt");

ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "FamilyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FamilyInvitation" ADD CONSTRAINT "FamilyInvitation_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "FamilyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
