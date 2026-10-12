ALTER TABLE "repos" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repos" DROP COLUMN "last_polled_at";