/* ContextTab — "Project context to use": attach repository docs to a skill for
   the active repository. Any agent using the skill inherits them under
   `## Project specifications`. Token numbers come from the server. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ProjectContextPicker } from "@/components/project-context-picker";
import { useActiveRepo } from "@/lib/repo-context";
import {
  useProjectDocuments,
  useSetSkillProjectContext,
  useSkillProjectContext,
} from "@/lib/hooks/project-context";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { repoId } = useActiveRepo();
  const listing = useProjectDocuments(repoId);
  const saved = useSkillProjectContext(skill.id, repoId);
  const save = useSetSkillProjectContext();

  if (repoId == null) {
    return (
      <div style={s.wrap}>
        <ProjectContextPicker repoId={null} documents={[]} attached={[]} onChange={() => {}} />
      </div>
    );
  }
  if (listing.isLoading || saved.isLoading) return <Skeleton height={220} />;
  if (listing.isError || saved.isError || !listing.data || !saved.data) {
    return (
      <ErrorState
        body={t("context.loadError")}
        onRetry={() => {
          void listing.refetch();
          void saved.refetch();
        }}
      />
    );
  }

  const ctx = saved.data;
  const serialized = [t("context.heading"), ...ctx.items.filter((i) => !i.missing).map((i) => `- ${i.path}`)].join("\n");
  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h2 style={s.title}>{t("context.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg, var(--bg-hover))">
          {t("context.counter", { count: ctx.items.length })}
        </Badge>
        <span className="tnum" style={s.total}>
          {t("context.tokens", { tokens: ctx.total_tokens })}
        </span>
      </div>
      <p style={s.hint}>{t("context.note")}</p>

      <ProjectContextPicker
        repoId={repoId}
        documents={listing.data.documents}
        attached={ctx.items}
        disabled={save.isPending}
        onChange={(paths) =>
          save.mutate({ skillId: skill.id, repoId, paths }, { onError: () => toast.error(t("context.saveError")) })
        }
      />

      {ctx.would_skip.length > 0 && (
        <div role="alert" style={s.warning}>
          {t("context.warningTitle")}
          <ul style={s.warningList}>
            {ctx.would_skip.map((w) => (
              <li key={`${w.section}:${w.path}`} className="mono">
                {w.path}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div style={s.serializes}>{t("context.serializesAs")}</div>
        <pre className="mono" style={s.preview}>
          {serialized}
        </pre>
      </div>
    </div>
  );
}
