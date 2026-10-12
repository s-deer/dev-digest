/* RiskList — the brief's risk areas as a list of pills; the open pill's panel
   unfolds directly under that pill, and one panel is open at a time. Panel
   text is plain text nodes (no HTML/Markdown); each file ref is a
   keyboard-activatable button into Files changed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BriefRiskRecord } from "@devdigest/shared";
import { RiskPill } from "../RiskPill";
import { s } from "../../styles";

export function RiskList({
  risks,
  onOpenFile,
}: {
  risks: BriefRiskRecord[];
  onOpenFile: (file: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState<number | null>(null);
  const baseId = React.useId();
  if (risks.length === 0) return <p style={s.note}>{t("noRisks")}</p>;
  return (
    <ul style={s.riskList}>
      {risks.map((r, i) => {
        const panelId = `${baseId}-panel-${i}`;
        return (
          <li key={`${r.title}:${i}`} style={s.riskItem}>
            <RiskPill
              risk={r}
              open={open === i}
              panelId={panelId}
              onToggle={() => setOpen(open === i ? null : i)}
              onOpenFile={onOpenFile}
            />
            {open === i && (
              <div id={panelId} style={s.riskPanel}>
                <p style={s.riskText}>{r.explanation}</p>
                <div style={s.fileRefs}>
                  {r.file_refs.map((file, j) => (
                    <button
                      key={file}
                      type="button"
                      className="mono"
                      aria-label={t("brief.riskFileAria", { file })}
                      style={s.linkBtn}
                      onClick={() => onOpenFile(file, j === 0 ? (r.line ?? null) : null)}
                    >
                      {file}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
