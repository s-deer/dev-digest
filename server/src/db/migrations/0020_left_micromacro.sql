ALTER TABLE "pr_intent" ADD CONSTRAINT "pr_intent_change_type_check" CHECK ("pr_intent"."change_type" in ('feature', 'bugfix', 'refactor', 'perf', 'security', 'docs', 'test', 'chore', 'deps', 'config', 'other'));--> statement-breakpoint
ALTER TABLE "pr_intent" ADD CONSTRAINT "pr_intent_confidence_check" CHECK ("pr_intent"."confidence" in ('high', 'medium', 'low'));--> statement-breakpoint
ALTER TABLE "pr_intent" ADD CONSTRAINT "pr_intent_confidence_score_check" CHECK ("pr_intent"."confidence_score" between 0 and 1);--> statement-breakpoint
ALTER TABLE "pr_intent" ADD CONSTRAINT "pr_intent_tokens_in_check" CHECK ("pr_intent"."tokens_in" >= 0);--> statement-breakpoint
ALTER TABLE "pr_intent" ADD CONSTRAINT "pr_intent_tokens_out_check" CHECK ("pr_intent"."tokens_out" >= 0);--> statement-breakpoint
ALTER TABLE "pr_intent" ADD CONSTRAINT "pr_intent_sources_array_check" CHECK (jsonb_typeof("pr_intent"."sources") = 'array');