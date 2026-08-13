-- Make Task.status the single source of truth for completion.
--
-- The table previously carried both `status` ('pending' | 'done' | 'skipped')
-- and a `completed` boolean — one fact in two columns, kept in sync by hand in
-- the update handler, and therefore able to disagree. `status` is kept because
-- it is strictly more expressive: it can represent "skipped", which a boolean
-- cannot. API responses still expose a derived `completed` flag, but nothing is
-- stored twice.

-- Reconcile before dropping: if the two columns ever disagreed, the boolean is
-- treated as authoritative, since it is what the UI rendered and what the user
-- actually saw. This is a no-op on a database where they agree.
UPDATE "Task" SET "status" = 'done'
  WHERE "completed" = true AND "status" <> 'done';

UPDATE "Task" SET "status" = 'pending'
  WHERE "completed" = false AND "status" = 'done';

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "completed";

-- CreateIndex
-- Supports regeneration, which deletes only unfinished tasks for a goal.
CREATE INDEX "Task_goalId_status_idx" ON "Task"("goalId", "status");
