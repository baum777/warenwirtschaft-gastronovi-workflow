CREATE TYPE "TeamRole" AS ENUM ('admin', 'shift_lead', 'staff');
CREATE TYPE "TeamMemberStatus" AS ENUM ('invited', 'active', 'suspended');

CREATE TABLE "UserProfile" (
  "id" TEXT NOT NULL,
  "authUserId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT,
  "avatarUrl" TEXT,
  "defaultTeamId" TEXT,
  "preferredStorageLocationId" TEXT,
  "preferencesJson" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Team" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "defaultLocationId" TEXT,
  "createdByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamMember" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "role" "TeamRole" NOT NULL,
  "status" "TeamMemberStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamInvite" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "TeamRole" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" "TeamMemberStatus" NOT NULL DEFAULT 'invited',
  "invitedByProfileId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeamInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserProfile_authUserId_key" ON "UserProfile"("authUserId");
CREATE UNIQUE INDEX "UserProfile_email_key" ON "UserProfile"("email");
CREATE INDEX "UserProfile_defaultTeamId_idx" ON "UserProfile"("defaultTeamId");
CREATE INDEX "UserProfile_preferredStorageLocationId_idx" ON "UserProfile"("preferredStorageLocationId");
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");
CREATE INDEX "Team_slug_idx" ON "Team"("slug");
CREATE INDEX "Team_defaultLocationId_idx" ON "Team"("defaultLocationId");
CREATE INDEX "Team_createdByProfileId_idx" ON "Team"("createdByProfileId");
CREATE UNIQUE INDEX "TeamMember_teamId_profileId_key" ON "TeamMember"("teamId", "profileId");
CREATE INDEX "TeamMember_profileId_idx" ON "TeamMember"("profileId");
CREATE INDEX "TeamMember_teamId_role_idx" ON "TeamMember"("teamId", "role");
CREATE INDEX "TeamMember_teamId_status_idx" ON "TeamMember"("teamId", "status");
CREATE UNIQUE INDEX "TeamInvite_tokenHash_key" ON "TeamInvite"("tokenHash");
CREATE INDEX "TeamInvite_teamId_idx" ON "TeamInvite"("teamId");
CREATE INDEX "TeamInvite_email_idx" ON "TeamInvite"("email");
CREATE INDEX "TeamInvite_status_expiresAt_idx" ON "TeamInvite"("status", "expiresAt");

ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_authUserId_fkey"
  FOREIGN KEY ("authUserId") REFERENCES auth.users("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_defaultTeamId_fkey"
  FOREIGN KEY ("defaultTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Team"
  ADD CONSTRAINT "Team_defaultLocationId_fkey"
  FOREIGN KEY ("defaultLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TeamMember"
  ADD CONSTRAINT "TeamMember_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamMember"
  ADD CONSTRAINT "TeamMember_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamInvite"
  ADD CONSTRAINT "TeamInvite_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamInvite"
  ADD CONSTRAINT "TeamInvite_invitedByProfileId_fkey"
  FOREIGN KEY ("invitedByProfileId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamInvite" ENABLE ROW LEVEL SECURITY;
