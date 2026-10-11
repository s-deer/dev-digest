/* RiskList — the brief's risk areas as a wrapping row of pills; one pill's
   panel is open at a time. Panel text is plain text nodes (no HTML/Markdown);
   each file ref is a keyboard-activatable button into Files changed. */
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
  const openRisk = open != null ? (risks[open] ?? null) : null;
  return (
    <div>
      <div style={s.riskRow}>
        {risks.map((r, i) => (
          <RiskPill
            key={`${r.title}:${i}`}
            risk={r}
            open={open === i}
            panelId={`${baseId}-panel`}
            onToggle={() => setOpen(open === i ? null : i)}
            onOpenFile={onOpenFile}
          />
        ))}
      </div>
      {openRisk && (
        <div id={`${baseId}-panel`} style={s.riskPanel}>
          <div style={s.riskPanelLabel}>{t("brief.riskWhy")}</div>
          <p style={s.riskText}>{openRisk.explanation}</p>
          <div style={s.fileRefs}>
            {openRisk.file_refs.map((file, j) => (
              <button
                key={file}
                type="button"
                className="mono"
                aria-label={t("brief.riskFileAria", { file })}
                style={s.linkBtn}
                onClick={() => onOpenFile(file, j === 0 ? (openRisk.line ?? null) : null)}
              >
                {file}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
