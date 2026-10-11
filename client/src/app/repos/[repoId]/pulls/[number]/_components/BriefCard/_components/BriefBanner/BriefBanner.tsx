/* BriefBanner — top of the PR Brief block: optional verdict tile (from the
   latest review that has a verdict), the brief summary, refresh, "Outdated",
   score and the brief's own cost. Verdict/findings/score come from the review;
   the summary comes from the brief. No review => no verdict parts, no error. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, CircularScore, Icon } from "@devdigest/ui";
import type { PrBriefRecord, ReviewRecord } from "@devdigest/shared";
import { RunCostBadge } from "@/components/run-cost-badge";
import { VERDICT_META } from "../../../VerdictBanner/constants";
import { reviewCounts } from "../../helpers";
import { s } from "../../styles";

export function BriefBanner({
  brief,
  stale,
  review,
  generating,
  onRefresh,
}: {
  brief: PrBriefRecord;
  stale: boolean;
  review: ReviewRecord | null;
  generating: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations("brief");
  const tr = useTranslations("prReview");
  const hintId = React.useId();
  const verdict = review?.verdict ?? null;
  const meta = verdict ? (VERDICT_META[verdict] ?? VERDICT_META.comment) : null;
  const VIcon = meta ? Icon[meta.icon] : null;
  const counts = review ? reviewCounts(review) : null;
  const score = review?.score ?? null;

  return (
    <div style={s.banner}>
      {meta && VIcon && (
        <div style={s.verdictTile(meta.bg, meta.c)}>
          <VIcon size={22} />
        </div>
      )}
      <div style={s.bannerMain}>
        <div style={s.bannerTitleRow}>
          {meta && counts && (
            <>
              <span style={s.verdictLabel(meta.c)}>{tr(`verdict.${meta.labelKey}`)}</span>
              <Badge color="var(--text-secondary)">
                {tr("verdict.findingsCount", { count: counts.findings })}
                {tr("verdict.blockers", { count: counts.blockers })}
              </Badge>
            </>
          )}
          <button
            type="button"
            style={s.hintBtn}
            aria-label={t("brief.hintLabel")}
            aria-describedby={hintId}
            title={t("brief.hint")}
          >
            <Icon.Info size={13} aria-hidden="true" />
          </button>
          <span id={hintId} style={s.srOnly}>
            {t("brief.hint")}
          </span>
        </div>
        <p style={s.bannerSummary}>{brief.summary}</p>
      </div>
      <div style={s.bannerRight}>
        <div style={s.bannerActions}>
          {stale && (
            <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
              {t("brief.outdated")}
            </Badge>
          )}
          <button
            type="button"
            style={s.refreshBtn(generating)}
            aria-label={t("brief.refreshAria")}
            title={t("brief.refreshAria")}
            disabled={generating}
            onClick={onRefresh}
          >
            <Icon.RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
        {generating ? (
          <div style={s.scoreSlot} role="img" aria-label={t("brief.generating")}>
            <Icon.RefreshCw size={24} style={s.spinner} aria-hidden="true" />
          </div>
        ) : (
          score != null && (
            <div style={s.scoreCol}>
              <CircularScore score={score} size={52} stroke={5} />
              <span style={s.scoreLabel}>{tr("verdict.prScore")}</span>
            </div>
          )
        )}
        <div style={s.costRow}>
          <Icon.DollarSign size={11} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <RunCostBadge
            variant="detailed"
            usd={brief.usage.cost_usd}
            tokensIn={brief.usage.tokens_in}
            tokensOut={brief.usage.tokens_out}
          />
        </div>
      </div>
    </div>
  );
}
