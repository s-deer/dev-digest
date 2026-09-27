/* GroupHeader — one Smart Diff group's header: chevron, colour square, role
   label + hint, and (on the right) the "● N files with findings" counter
   plus the group's file count. Sticks to the top of the viewport while its
   files scroll underneath. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SmartDiffRole } from "@devdigest/shared";
import { ROLE_COLOR, ROLE_LABEL_KEY, ROLE_HINT_KEY } from "../../../../constants";
import { s, chevronFor, colorSquareFor } from "./styles";

export function GroupHeader({
  role,
  filesCount,
  filesWithFindingsCount,
  open,
  onToggle,
}: {
  role: SmartDiffRole;
  filesCount: number;
  filesWithFindingsCount: number;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("prReview");
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={onToggle}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      style={s.header}
    >
      <Icon.ChevronRight size={13} style={chevronFor(open)} aria-hidden="true" />
      <span style={colorSquareFor(ROLE_COLOR[role])} aria-hidden="true" />
      <span style={s.label}>{t(ROLE_LABEL_KEY[role])}</span>
      <span style={s.hint}>{t(ROLE_HINT_KEY[role])}</span>
      <span style={s.right}>
        {filesWithFindingsCount > 0 && (
          <span
            className="tnum"
            style={s.countWrap}
            aria-label={t("smartDiff.filesWithFindings", { count: filesWithFindingsCount })}
          >
            <span style={s.dot} aria-hidden="true" />
            {filesWithFindingsCount}
          </span>
        )}
        <span className="tnum" style={s.filesCount}>
          {t("smartDiff.filesCount", { count: filesCount })}
        </span>
      </span>
    </div>
  );
}
