-- PATCH-17: guest identity, matches in progress and a complete event stream.
-- NOT APPLIED OR TESTED AGAINST A REAL DATABASE: the project has no configured server.
-- Assumes tables created from the previous schema.prisma. Apply to a copy first.

CREATE TYPE "AccountType" AS ENUM ('GUEST', 'REGISTERED');
CREATE TYPE "MatchStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABORTED', 'INTERRUPTED');
CREATE TYPE "MatchVisibility" AS ENUM ('PRIVATE', 'LINK', 'PUBLIC');

ALTER TABLE "User"
  ADD COLUMN "authProviderId" TEXT,
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "accountType" "AccountType" NOT NULL DEFAULT 'REGISTERED',
  ADD COLUMN "lastSeenAt" TIMESTAMP(3),
  ADD COLUMN "upgradedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_authProviderId_key" ON "User"("authProviderId");

ALTER TABLE "MatchHistory"
  ADD COLUMN "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "status" "MatchStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  ADD COLUMN "visibility" "MatchVisibility" NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN "ownerUserId" TEXT,
  ADD COLUMN "lastSequence" INTEGER NOT NULL DEFAULT -1,
  ADD COLUMN "lastPly" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "result" TEXT;
-- Every row that existed before this migration describes a finished match.
UPDATE "MatchHistory" SET "status" = 'COMPLETED', "startedAt" = "endedAt", "updatedAt" = "endedAt";
ALTER TABLE "MatchHistory"
  ALTER COLUMN "endedAt" DROP NOT NULL,
  ALTER COLUMN "endedAt" DROP DEFAULT;
CREATE INDEX "MatchHistory_ownerUserId_updatedAt_idx" ON "MatchHistory"("ownerUserId", "updatedAt" DESC);
CREATE INDEX "MatchHistory_ownerUserId_status_idx" ON "MatchHistory"("ownerUserId", "status");

ALTER TABLE "MatchEvent"
  ALTER COLUMN "notation" DROP NOT NULL,
  ALTER COLUMN "fromCoord" DROP NOT NULL,
  ALTER COLUMN "toCoord" DROP NOT NULL,
  ALTER COLUMN "pieceId" DROP NOT NULL,
  ADD COLUMN "sequence" INTEGER,
  ADD COLUMN "eventKey" TEXT,
  ADD COLUMN "type" TEXT,
  ADD COLUMN "payload" JSONB,
  ADD COLUMN "delta" JSONB,
  ADD COLUMN "checksum" TEXT,
  ADD COLUMN "engineVersion" TEXT,
  ADD COLUMN "occurredAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "MatchEvent_eventKey_key" ON "MatchEvent"("eventKey");
CREATE UNIQUE INDEX "MatchEvent_matchId_sequence_key" ON "MatchEvent"("matchId", "sequence");
