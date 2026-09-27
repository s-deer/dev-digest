/* OutsideFindings — end-of-file block for findings whose start_line isn't in
   the current patch (GitHub-outdated diff, or the finding cites a line the
   diff doesn't render). Styled like OutdatedComments so nothing is silently
   dropped. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { cs } from "../comments";
import { FindingComment } from "../FindingComment";

export function OutsideFindings({
  findings,
  onAction,
  pending,
}: {
  findings: FindingRecord[];
  onAction: (findingId: string, action: FindingActionKind) => void;
  pending: boolean;
}) {
  const t = useTranslations("prReview");
  if (findings.length === 0) return null;
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>{t("smartDiff.findingsOutsideDiff")}</span>
      {findings.map((f) => (
        <FindingComment key={f.id} finding={f} onAction={(action) => onAction(f.id, action)} pending={pending} />
      ))}
    </div>
  );
}
