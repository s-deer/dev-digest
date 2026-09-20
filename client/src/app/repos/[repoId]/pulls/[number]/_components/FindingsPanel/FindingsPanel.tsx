/* FindingsPanel — severity pills (count + filter), hide-low-confidence, j/k
   navigation + FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { SeverityPills } from "./_components/SeverityPills";
import { KEY_TO_ACTION } from "./constants";
import { countBySeverity, visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [severity, setSeverity] = React.useState<Severity | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  // Pill counts come from the list before the severity filter, so each pill
  // equals the number of cards clicking it reveals.
  const counts = React.useMemo(
    () => countBySeverity(visibleFindings(findings, hideLow)),
    [findings, hideLow],
  );
  // A filter whose severity no longer has any cards (e.g. hide-low hid them) is inert.
  const activeSeverity = severity && counts[severity] > 0 ? severity : null;
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, activeSeverity),
    [findings, hideLow, activeSeverity],
  );

  const toggleSeverity = (sev: Severity) => {
    setSeverity(activeSeverity === sev ? null : sev);
    setFocusIdx(0);
  };
  const toggleHideLow = (on: boolean) => {
    setHideLow(on);
    setFocusIdx(0);
  };

  // Handle shortcuts on the focused panel instead of globally. Multiple review
  // accordions can be mounted at once, and global listeners make them all react.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      e.metaKey ||
      e.ctrlKey ||
      e.altKey ||
      target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)
    ) {
      return;
    }
    if (shown.length === 0) return;

    if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
    else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
    else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
      action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
    }
  };

  return (
    <div
      role="region"
      aria-label={t("panel.keyboardShortcuts")}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div style={s.toolbar}>
        <SeverityPills counts={counts} active={activeSeverity} onToggle={toggleSeverity} />
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={toggleHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
