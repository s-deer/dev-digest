/* FindingComment — a simpler FindingCard for inline use in the diff: severity
   icon+label, title, category tag, a "line N · conf%" meta line, markdown
   rationale, a boxed suggested fix, Accept/Dismiss. Collapses to one line
   (the header) via the top-right ×; expands again by clicking that
   collapsed header. Rendered under a diff line (RIGHT:<start_line>) or in
   the end-of-file "Findings outside the diff" block. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  ConfidenceNum,
  Button,
  Markdown,
  SEV,
  type Severity,
  type Category,
} from "@devdigest/ui";
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
  const sevColor = SEV[finding.severity as Severity].c;

  return (
    <div data-finding-id={finding.id} style={s.card(muted, sevColor)}>
      <div style={s.headerWrap}>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={s.headerBtn}
          aria-expanded={expanded}
        >
          <SeverityBadge severity={finding.severity as Severity} />
          <span style={s.title(muted, dismissed)}>{finding.title}</span>
          <CategoryTag category={finding.category as Category} />
          {accepted && <span style={s.tag("var(--ok)")}>{t("finding.accepted")}</span>}
          {dismissed && <span style={s.tag("var(--text-muted)")}>{t("finding.dismissed")}</span>}
        </button>
        {expanded && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label={t("smartDiff.collapseFinding")}
            style={s.closeBtn}
          >
            <Icon.X size={13} />
          </button>
        )}
      </div>

      {expanded && (
        <div style={s.body}>
          <div style={s.meta}>
            <span className="mono">{t("smartDiff.metaLine", { line: finding.start_line })}</span>
            {" · "}
            <ConfidenceNum value={finding.confidence} />
          </div>
          <div style={s.prose}>
            <Markdown>{finding.rationale}</Markdown>
          </div>
          {finding.suggestion && (
            <div style={s.suggestionBox}>
              <div style={s.suggestionHeading}>
                <Icon.Lightbulb size={12} aria-hidden="true" />
                {t("finding.suggestedFix")}
              </div>
              <div style={s.prose}>
                <Markdown>{finding.suggestion}</Markdown>
              </div>
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
              kind="secondary"
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
