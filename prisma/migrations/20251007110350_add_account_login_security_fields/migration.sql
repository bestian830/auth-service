-- AlterTable
-- Add login security fields to Account table
ALTER TABLE "Account"
ADD COLUMN "loginFailureCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastLoginFailureAt" TIMESTAMP(3),
ADD COLUMN "lockedUntil" TIMESTAMP(3),
ADD COLUMN "lockReason" TEXT;
