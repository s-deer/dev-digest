/* BriefCard — the generated PR Brief (L05) block on the Overview tab: banner,
   Intent + Risk areas / Blast radius grid, Review focus and notes. Reading
   never calls the model; "Generate"/refresh does. A stored brief is never
   hidden by an error — it stays visible with an inline retry row. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon } from "@devdigest/ui";
import type { ReviewRecord } from "@devdigest/shared";
import { usePrBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { BriefBanner } from "./_components/BriefBanner";
import { BriefEmpty } from "./_components/BriefEmpty";
import { BriefGrid } from "./_components/BriefGrid";
import { BriefSkeleton } from "./_components/BriefSkeleton";
import { ReviewFocusBlock } from "./_components/ReviewFocusBlock";
import { RiskList } from "./_components/RiskList";
import { hasRemovedItems, missingFactKeys, pickVerdictReview } from "./helpers";
import { s } from "./styles";

export function BriefCard({
  prId,
  repoId,
  repoFullName,
  headSha,
  reviews,
  onOpenFile,
}: {
  prId: string | null;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null;
  reviews?: ReviewRecord[] | null;
  onOpenFile: (file: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  // Disabled queries stay `isPending` forever — branch on `!prId || isLoading`
  // (client/INSIGHTS.md, 2026-09-26).
  const { data, isLoading, isError, refetch } = usePrBrief(prId);
  const generate = useGenerateBrief(prId);
  const brief = data?.brief ?? null;
  const regenerate = () => generate.mutate();
  const grid = { prId, repoId, repoFullName, headSha };

  const content = (() => {
    if (!prId || isLoading || (generate.isPending && !brief)) return <BriefSkeleton />;

    if (!brief) {
      return (
        <div style={s.stack}>
          {isError ? (
            <ErrorState body={t("brief.loadError")} onRetry={() => refetch()} />
          ) : generate.isError ? (
            <ErrorState body={t("brief.generateError")} onRetry={regenerate} />
          ) : (
            <BriefEmpty onGenerate={regenerate} />
          )}
          <BriefGrid {...grid} />
        </div>
      );
    }

    const review = pickVerdictReview(reviews);
    const banner = (
      <BriefBanner
        brief={brief}
        stale={!!data?.stale}
        review={review}
        generating={generate.isPending}
        onRefresh={regenerate}
      />
    );
    if (generate.isPending) {
      return (
        <div style={s.stack}>
          {banner}
          <BriefSkeleton />
        </div>
      );
    }

    const missing = missingFactKeys(brief.facts);
    const errorText = generate.isError ? t("brief.generateError") : isError ? t("brief.loadError") : null;
    return (
      <div style={s.stack}>
        {banner}
        {errorText && (
          <div role="alert" style={s.inlineError}>
            <span>{errorText}</span>
            <Button kind="secondary" size="sm" icon="RefreshCw" onClick={generate.isError ? regenerate : () => refetch()}>
              {t("brief.retry")}
            </Button>
          </div>
        )}
        <BriefGrid {...grid} riskSlot={<RiskList risks={brief.risks} onOpenFile={onOpenFile} />} />
        <ReviewFocusBlock items={brief.review_focus} onOpenFile={onOpenFile} />
        {hasRemovedItems(brief.grounding) && (
          <p style={s.note}>
            <Icon.Info size={12} aria-hidden="true" />{" "}
            {t("brief.removedNote", { risks: brief.grounding.risks_dropped, focus: brief.grounding.focus_dropped })}
          </p>
        )}
        {missing.length > 0 && (
          <p style={s.note}>
            {t("brief.generatedWithout", { facts: missing.map((k) => t(`brief.fact.${k}`)).join(", ") })}
          </p>
        )}
      </div>
    );
  })();

  return <div aria-live="polite">{content}</div>;
}
