/* RiskPill — one risk: a navigation button (kind icon coloured by severity
   beside the title, `file[:line]` under it) plus a separate expand control.
   Severity is also in the accessible name, never colour alone. `kind` is only
   a lookup key. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BriefRiskRecord } from "@devdigest/shared";
import { SEVERITY_COLOR, iconNameForKind, riskRef } from "../../helpers";
import { s } from "../../styles";

export function RiskPill({
  risk,
  open,
  panelId,
  onToggle,
  onOpenFile,
}: {
  risk: BriefRiskRecord;
  open: boolean;
  panelId: string;
  onToggle: () => void;
  onOpenFile: (file: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  const color = SEVERITY_COLOR[risk.severity];
  const KindIcon = Icon[iconNameForKind(risk.kind)];
  const first = risk.file_refs[0];
  return (
    <div style={s.pill(open, color)}>
      <button
        type="button"
        style={s.pillMain}
        aria-label={t("brief.riskAria", { severity: t(`brief.severity.${risk.severity}`), title: risk.title })}
        onClick={() => first != null && onOpenFile(first, risk.line ?? null)}
      >
        <span style={s.pillTitle}>
          <KindIcon size={13} aria-hidden="true" style={{ color, flexShrink: 0 }} />
          <span style={{ minWidth: 0 }}>{risk.title}</span>
        </span>
        {first != null && (
          <span className="mono" style={s.pillRef} title={riskRef(risk)}>
            {riskRef(risk)}
          </span>
        )}
      </button>
      <button
        type="button"
        style={s.pillToggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t("brief.riskWhy")}
        title={t("brief.riskWhy")}
        onClick={onToggle}
      >
        <Icon.ChevronDown size={14} aria-hidden="true" style={s.pillChevron(open)} />
      </button>
    </div>
  );
}
