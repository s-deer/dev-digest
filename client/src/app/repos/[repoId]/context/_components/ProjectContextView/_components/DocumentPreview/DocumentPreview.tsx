/* DocumentPreview — the selected document rendered as Markdown (untrusted:
   no raw HTML, remote images blocked) with its "Used by" popover. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import { useProjectDocument } from "@/lib/hooks/project-context";
import { UsedByPopover } from "../UsedByPopover";

const head: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "14px 24px",
  borderBottom: "1px solid var(--border)",
};
const body: React.CSSProperties = { flex: 1, overflow: "auto", padding: "20px 28px", fontSize: 14, color: "var(--text-secondary)" };

export function DocumentPreview({ repoId, path }: { repoId: string; path: string }) {
  const t = useTranslations("context");
  const doc = useProjectDocument(repoId, path);
  return (
    <>
      <div style={head}>
        <span className="mono" style={{ fontWeight: 600, fontSize: 14 }}>
          {path}
        </span>
        {doc.data && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("page.previewTokens", { tokens: doc.data.tokens })}</span>
        )}
        <span style={{ flex: 1 }} />
        {doc.data && <UsedByPopover path={path} users={doc.data.used_by} />}
      </div>
      <div style={body}>
        {doc.isLoading ? (
          <Skeleton height={200} />
        ) : doc.isError || !doc.data ? (
          <ErrorState body={t("page.previewLoadError")} onRetry={() => doc.refetch()} />
        ) : (
          <Markdown blockRemoteImages>{doc.data.content}</Markdown>
        )}
      </div>
    </>
  );
}
