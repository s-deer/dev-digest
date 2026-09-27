/* FindingComment — a simpler FindingCard for inline use in the diff: severity
   badge, title, markdown rationale + suggestion, Accept/Dismiss. Collapses to
   one line (the header). Rendered under a diff line (RIGHT:<start_line>) or
   in the end-of-file "Findings outside the diff" block. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, Button, Markdown, type Severity } from "@devdigest/ui";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { s } from "./styles";

export function FindingComment({
  finding,
  onAction,
  pending,
}: {
  finding: FindingRecord;
  onAction: (action: FindingActionKind) => void;
  pending?: boolean;
}) {
  const t = useTranslations("prReview");
  const [expanded, setExpanded] = React.useState(true);
  const accepted = !!finding.accepted_at;
  const dismissed = !!finding.dismissed_at;
  const muted = accepted || dismissed;

  return (
    <div data-finding-id={finding.id} style={s.card(muted)}>
      <div
        onClick={() => setExpanded((e) => !e)}
        style={s.header}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? t("smartDiff.collapseFinding") : t("smartDiff.expandFinding")}
      >
        <SeverityBadge severity={finding.severity as Severity} compact />
        <span style={s.title(muted, dismissed)}>{finding.title}</span>
        {accepted && <span style={s.tag("var(--ok)")}>{t("finding.accepted")}</span>}
        {dismissed && <span style={s.tag("var(--text-muted)")}>{t("finding.dismissed")}</span>}
        <Icon.ChevronDown size={14} style={s.chevron(expanded)} />
      </div>

      {expanded && (
        <div style={s.body}>
          <div style={s.prose}>
            <Markdown>{finding.rationale}</Markdown>
          </div>
          {finding.suggestion && (
            <div style={s.prose}>
              <Markdown>{finding.suggestion}</Markdown>
            </div>
          )}
          <div style={s.actions}>
            <Button
              kind="secondary"
              size="sm"
              icon="Check"
              disabled={pending}
              active={accepted}
              onClick={() => onAction("accept")}
            >
              {t("finding.accept")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              disabled={pending}
              active={dismissed}
              onClick={() => onAction("dismiss")}
            >
              {t("finding.dismiss")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
