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

  const [refreshHover, setRefreshHover] = React.useState(false);

  // The hint sits beside the verdict; with no verdict it joins the refresh
  // button so it never floats alone above the summary.
  const hint = (
    <>
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
    </>
  );
  const titled = meta != null && counts != null;
  const scoreShown = generating || score != null;

  return (
    <div style={s.banner}>
      {meta && VIcon && (
        <div style={s.verdictTile(meta.bg, meta.c)}>
          <VIcon size={22} />
        </div>
      )}
      <div style={s.bannerMain}>
        {titled && (
          <div style={s.bannerTitleRow}>
            <span style={s.verdictLabel(meta.c)}>{tr(`verdict.${meta.labelKey}`)}</span>
            <Badge color="var(--text-secondary)">
              {tr("verdict.findingsCount", { count: counts.findings })}
              {tr("verdict.blockers", { count: counts.blockers })}
            </Badge>
            {hint}
          </div>
        )}
        <p style={s.bannerSummary(titled)}>{brief.summary}</p>
      </div>
      <div style={s.bannerActions}>
        {stale && (
          <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
            {t("brief.outdated")}
          </Badge>
        )}
        {!titled && hint}
        <button
          type="button"
          style={s.refreshBtn(generating, refreshHover)}
          aria-label={t("brief.refreshAria")}
          title={t("brief.refreshAria")}
          disabled={generating}
          onClick={onRefresh}
          onMouseEnter={() => setRefreshHover(true)}
          onMouseLeave={() => setRefreshHover(false)}
        >
          <Icon.RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>
      <div style={s.scoreCol}>
        {generating ? (
          <div style={s.scoreSlot} role="img" aria-label={t("brief.generating")}>
            <Icon.RefreshCw size={24} style={s.spinner} aria-hidden="true" />
          </div>
        ) : (
          score != null && <CircularScore score={score} size={52} stroke={5} />
        )}
        {score != null && <span style={s.scoreLabel}>{tr("verdict.prScore")}</span>}
        <div style={s.costRow(scoreShown)}>
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
