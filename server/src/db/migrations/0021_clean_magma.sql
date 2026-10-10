CREATE TABLE "project_context_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"owner_kind" text NOT NULL,
	"agent_id" uuid,
	"skill_id" uuid,
	"path" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_context_attachments_owner_check" CHECK (("project_context_attachments"."owner_kind" = 'agent' and "project_context_attachments"."agent_id" is not null and "project_context_attachments"."skill_id" is null)
        or ("project_context_attachments"."owner_kind" = 'skill' and "project_context_attachments"."skill_id" is not null and "project_context_attachments"."agent_id" is null))
);
--> statement-breakpoint
ALTER TABLE "project_context_attachments" ADD CONSTRAINT "project_context_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_context_attachments" ADD CONSTRAINT "project_context_attachments_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_context_attachments" ADD CONSTRAINT "project_context_attachments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_context_attachments" ADD CONSTRAINT "project_context_attachments_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_context_attachments_agent_path_uq" ON "project_context_attachments" USING btree ("agent_id","repo_id","path") WHERE "project_context_attachments"."agent_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "project_context_attachments_skill_path_uq" ON "project_context_attachments" USING btree ("skill_id","repo_id","path") WHERE "project_context_attachments"."skill_id" is not null;--> statement-breakpoint
CREATE INDEX "project_context_attachments_agent_pos_idx" ON "project_context_attachments" USING btree ("agent_id","repo_id","position");--> statement-breakpoint
CREATE INDEX "project_context_attachments_skill_pos_idx" ON "project_context_attachments" USING btree ("skill_id","repo_id","position");--> statement-breakpoint
CREATE INDEX "project_context_attachments_repo_idx" ON "project_context_attachments" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX "project_context_attachments_workspace_idx" ON "project_context_attachments" USING btree ("workspace_id");