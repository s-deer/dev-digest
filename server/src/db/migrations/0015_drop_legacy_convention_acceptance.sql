UPDATE "conventions"
SET "status" = 'accepted'
WHERE "accepted" = true;
--> statement-breakpoint
ALTER TABLE "conventions" DROP COLUMN "accepted";
