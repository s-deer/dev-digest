ALTER TABLE "pr_intent" ADD COLUMN "workspace_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "head_sha" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "inputs_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "change_type" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "confidence" text DEFAULT 'low' NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "confidence_score" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "missing_docs" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "sources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "provider" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "model" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "tokens_in" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "tokens_out" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "cost_usd" numeric;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "cost_usd_total" numeric;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD CONSTRAINT "pr_intent_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pr_intent_ws_idx" ON "pr_intent" USING btree ("workspace_id");