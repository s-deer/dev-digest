/* RiskList — the brief's risk areas. Severity is an icon plus a text label;
   each file ref is a keyboard-activatable button that deep-links into Files
   changed. All model text is rendered as plain text nodes. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BriefRiskOut } from "@devdigest/shared";
import { SEVERITY_COLOR } from "../../helpers";
import { s } from "../../styles";

export function RiskList({
  risks,
  onOpenFile,
}: {
  risks: BriefRiskOut[];
  onOpenFile: (file: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  if (risks.length === 0) return <p style={s.note}>{t("noRisks")}</p>;
  return (
    <ul style={s.list}>
      {risks.map((r, i) => (
        <li key={`${r.title}:${i}`}>
          <div style={s.riskTitleRow}>
            <span style={s.riskTitle}>{r.title}</span>
            <span style={s.severity(SEVERITY_COLOR[r.severity])}>
              <Icon.AlertTriangle size={12} aria-hidden="true" />
              {t(`brief.severity.${r.severity}`)}
            </span>
          </div>
          <p style={s.riskText}>{r.explanation}</p>
          <div style={s.fileRefs}>
            {r.file_refs.map((file) => (
              <button
                key={file}
                type="button"
                className="mono"
                aria-label={t("brief.riskFileAria", { file })}
                style={s.linkBtn}
                onClick={() => onOpenFile(file, null)}
              >
                {file}
              </button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
