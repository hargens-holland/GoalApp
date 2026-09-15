-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "hue" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing goals so no two goals of the same user share a hue.
-- Golden-angle spacing (137°) by creation order gives well-separated hues for
-- any small number of goals; new goals are assigned by lib/colors.ts pickHue.
UPDATE "Goal" g
SET "hue" = sub.h
FROM (
  SELECT id,
         ((ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt", id) - 1) * 137) % 360 AS h
  FROM "Goal"
) sub
WHERE g.id = sub.id;
