-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('owner', 'admin', 'manager', 'staff', 'viewer');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'admin', 'manager', 'staff', 'viewer');

-- AlterTable
ALTER TABLE "InventoryMovement"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "organizationId" TEXT;

-- Backfill idempotency keys for existing rows before NOT NULL + UNIQUE.
UPDATE "InventoryMovement"
SET "idempotencyKey" = CONCAT('legacy:', "id")
WHERE "idempotencyKey" IS NULL;

-- AlterTable
ALTER TABLE "InventoryMovement"
ALTER COLUMN "idempotencyKey" SET NOT NULL;

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_idempotencyKey_key" ON "InventoryMovement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryMovement_organizationId_type_createdAt_idx" ON "InventoryMovement"("organizationId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE INDEX "OrganizationMember_organizationId_idx" ON "OrganizationMember"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_organizationId_idx" ON "WorkspaceMember"("organizationId");

-- RLS
ALTER TABLE "OrganizationMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryMovement" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organization_member_isolation"
ON "OrganizationMember"
USING ((SELECT auth.uid())::text = "userId")
WITH CHECK ((SELECT auth.uid())::text = "userId");

CREATE POLICY "workspace_member_isolation"
ON "WorkspaceMember"
USING (
  EXISTS (
    SELECT 1
    FROM "OrganizationMember" AS om
    WHERE om."organizationId" = "WorkspaceMember"."organizationId"
      AND om."userId" = (SELECT auth.uid())::text
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "OrganizationMember" AS om
    WHERE om."organizationId" = "WorkspaceMember"."organizationId"
      AND om."userId" = (SELECT auth.uid())::text
  )
);

CREATE POLICY "inventory_movement_org_isolation"
ON "InventoryMovement"
USING (
  "organizationId" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "OrganizationMember" AS om
    WHERE om."organizationId" = "InventoryMovement"."organizationId"
      AND om."userId" = (SELECT auth.uid())::text
  )
)
WITH CHECK (
  "organizationId" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "OrganizationMember" AS om
    WHERE om."organizationId" = "InventoryMovement"."organizationId"
      AND om."userId" = (SELECT auth.uid())::text
  )
);
