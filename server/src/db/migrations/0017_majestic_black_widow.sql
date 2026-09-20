ALTER TABLE "convention_scans" ALTER COLUMN "cost_usd" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "agent_runs" ALTER COLUMN "cost_usd" SET DATA TYPE numeric;--> statement-breakpoint
CREATE INDEX "conventions_scan_idx" ON "conventions" USING btree ("scan_id");