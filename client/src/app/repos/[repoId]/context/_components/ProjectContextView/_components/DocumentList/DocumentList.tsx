"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { ProjectDocument } from "@devdigest/shared";
import { useProjectDocument } from "@/lib/hooks/project-context";
import { UsedByPopover } from "../UsedByPopover";

const list: React.CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 };
const row = (active: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "8px 10px",
  borderRadius: 7,
  border: "none",
  textAlign: "left",
  cursor: "pointer",
  background: active ? "var(--bg-hover)" : "transparent",
  color: "var(--text-primary)",
});
const metaStyle: React.CSSProperties = { fontSize: 11.5, color: "var(--text-muted)" };

/** Row-level "Used by N agents": the doc's `used_by` is fetched only once the popover is opened (shares the preview's query key). */
function RowUsedBy({ repoId, doc }: { repoId: string; doc: ProjectDocument }) {
  const [wanted, setWanted] = React.useState(false);
  const detail = useProjectDocument(repoId, wanted ? doc.path : null);
  return (
    <UsedByPopover
      path={doc.path}
      users={detail.data?.used_by}
      count={doc.used_by_agents}
      failed={detail.isError}
      onOpen={() => setWanted(true)}
    />
  );
}

export function DocumentList({
  repoId,
  documents,
  selected,
  onSelect,
}: {
  repoId: string;
  documents: ProjectDocument[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const t = useTranslations("context");
  return (
    <ul style={list}>
      {documents.map((d) => (
        <li key={d.path} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button type="button" style={{ ...row(d.path === selected), flex: 1, minWidth: 0, width: "auto" }} aria-current={d.path === selected} onClick={() => onSelect(d.path)}>
            <Icon.FileText size={14} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="mono" style={{ display: "block", fontSize: 13, overflowWrap: "anywhere" }}>
                {d.path}
              </span>
              <span style={metaStyle}>
                {t("picker.tokens", { tokens: d.tokens })}
              </span>
            </span>
            <Badge>{t(`picker.type.${d.type}`)}</Badge>
          </button>
          {d.used_by_agents > 0 && <RowUsedBy repoId={repoId} doc={d} />}
        </li>
      ))}
    </ul>
  );
}
