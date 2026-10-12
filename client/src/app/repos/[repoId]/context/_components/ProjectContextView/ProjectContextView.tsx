/* ProjectContextView — read-only Project Context page: discovered repo docs on
   the left, Markdown preview on the right. No create/edit/upload by design;
   docs change in git and appear here after Refresh. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { useProjectDocuments } from "@/lib/hooks/project-context";
import { DocumentList } from "./_components/DocumentList";
import { DocumentPreview } from "./_components/DocumentPreview";
import { s } from "./styles";

export function ProjectContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const listing = useProjectDocuments(repoId);
  const [picked, setPicked] = React.useState<string | null>(null);

  if (listing.isLoading) {
    return (
      <div style={s.state}>
        <Skeleton height={240} width={480} />
      </div>
    );
  }
  // No stale list on failure: the previous listing is never shown over an error.
  if (listing.isError || !listing.data) {
    return (
      <div style={s.state}>
        <ErrorState title={t("page.loadError")} onRetry={() => listing.refetch()} />
      </div>
    );
  }

  const { documents, patterns, total_files, total_tokens, refreshed_at } = listing.data;
  const selected = documents.find((d) => d.path === picked)?.path ?? documents[0]?.path ?? null;
  const patternText = patterns.join(", ");
  const refreshed = new Date(refreshed_at).toLocaleTimeString();

  return (
    <div style={s.page}>
      <aside style={s.listCol} aria-label={t("page.listLabel")}>
        <div style={s.listHead}>
          <div>
            <h2 style={s.listTitle}>{t("page.listTitle")}</h2>
            <p className="mono" style={s.patterns}>
              {patternText}
            </p>
          </div>
          <Button kind="ghost" size="sm" icon="RefreshCw" loading={listing.isFetching} onClick={() => listing.refetch()}>
            {listing.isFetching ? t("page.refreshing") : t("page.refresh")}
          </Button>
        </div>
        <div style={s.listScroll}>
          <DocumentList repoId={repoId} documents={documents} selected={selected} onSelect={setPicked} />
        </div>
        <div style={s.footer}>
          <span>{t("page.footer", { files: total_files, tokens: total_tokens })}</span>
          <span>{t("page.refreshed", { time: refreshed })}</span>
        </div>
      </aside>
      <section style={s.previewCol}>
        {documents.length === 0 ? (
          <EmptyState icon="Folder" title={t("page.empty.title")} body={t("page.empty.body", { patterns: patternText })} />
        ) : selected ? (
          <DocumentPreview repoId={repoId} path={selected} />
        ) : (
          <EmptyState icon="FileText" title={t("page.selectDoc")} />
        )}
      </section>
    </div>
  );
}
