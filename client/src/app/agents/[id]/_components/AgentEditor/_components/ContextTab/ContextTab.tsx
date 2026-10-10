/* ContextTab — attach repository docs to an agent for the active repository.
   Saved state comes from the server (including every token number); each change
   sends the whole ordered path list. Skill-inherited docs are shown read-only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ProjectContextPicker } from "@/components/project-context-picker";
import { useActiveRepo } from "@/lib/repo-context";
import {
  useAgentProjectContext,
  useProjectDocuments,
  useSetAgentProjectContext,
} from "@/lib/hooks/project-context";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const { repoId } = useActiveRepo();
  const listing = useProjectDocuments(repoId);
  const saved = useAgentProjectContext(agent.id, repoId);
  const save = useSetAgentProjectContext();

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
  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h2 style={s.title}>{t("context.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg, var(--bg-hover))">
          {t("context.counter", { attached: ctx.items.length, total: listing.data.documents.length })}
        </Badge>
      </div>
      <p style={s.hint}>{t("context.hint")}</p>

      <ProjectContextPicker
        repoId={repoId}
        documents={listing.data.documents}
        attached={ctx.items}
        inherited={ctx.inherited}
        disabled={save.isPending}
        onChange={(paths) =>
          save.mutate({ agentId: agent.id, repoId, paths }, { onError: () => toast.error(t("context.saveError")) })
        }
      />

      {ctx.would_skip.length > 0 && (
        <div role="alert" style={s.warning}>
          {t("context.warningTitle")}
          <ul style={s.warningList}>
            {ctx.would_skip.map((w) => (
              <li key={`${w.section}:${w.path}`}>
                <span className="mono">{w.path}</span> ({t(`context.section.${w.section}`)})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={s.footer}>
        <span>
          <span className="tnum" style={s.total}>
            {t("context.footer", { tokens: ctx.totals.total })}
          </span>
          {" · "}
          <span className="mono">
            {t("context.breakdown", { context: ctx.totals.context_tokens, specs: ctx.totals.specs_tokens })}
          </span>
        </span>
        <span>{t("context.untrustedNote")}</span>
      </div>
    </div>
  );
}
