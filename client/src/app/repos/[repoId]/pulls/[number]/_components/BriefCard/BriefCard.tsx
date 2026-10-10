/* BriefCard — the generated PR Brief (L05) on the Overview tab: summary,
   risk areas and review focus, stored per head SHA. Reading never calls the
   model; "Generate"/"Refresh" does. A stored brief is never hidden by an
   error — it stays visible with an inline retry line. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { usePrBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { FocusList } from "./_components/FocusList";
import { RiskList } from "./_components/RiskList";
import { hasRemovedItems, missingFactKeys } from "./helpers";
import { s } from "./styles";

export function BriefCard({
  prId,
  onOpenFile,
}: {
  prId: string | null;
  onOpenFile: (file: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  // Disabled queries stay `isPending` forever — branch on `!prId || isLoading`
  // (client/INSIGHTS.md, 2026-09-26).
  const { data, isLoading, isError, refetch } = usePrBrief(prId);
  const generate = useGenerateBrief(prId);
  const brief = data?.brief ?? null;
  const regenerate = () => generate.mutate();

  const content = (() => {
    if (!prId || isLoading || generate.isPending) {
      return (
        <Card>
          {generate.isPending && (
            <div style={s.headerRow}>
              <span />
              <Button kind="secondary" size="sm" icon="RefreshCw" loading disabled>
                {brief ? t("brief.refresh") : t("brief.generate")}
              </Button>
            </div>
          )}
          <Skeleton height={13} width="30%" style={{ marginBottom: 14 }} />
          <Skeleton height={10} width="95%" style={{ marginBottom: 9 }} />
          <Skeleton height={10} width="80%" style={{ marginBottom: 9 }} />
          <Skeleton height={10} width="60%" />
        </Card>
      );
    }

    if (!brief) {
      if (isError) return <ErrorState body={t("brief.loadError")} onRetry={() => refetch()} />;
      if (generate.isError) return <ErrorState body={t("brief.generateError")} onRetry={regenerate} />;
      return (
        <Card style={s.emptyCard}>
          <div style={s.emptyBody}>
            <div style={s.emptyTitle}>{t("brief.emptyTitle")}</div>
            <p style={s.emptyText}>{t("brief.emptyBody")}</p>
            <Button kind="primary" icon="FileText" onClick={regenerate}>
              {t("brief.generate")}
            </Button>
          </div>
        </Card>
      );
    }

    const missing = missingFactKeys(brief.facts);
    const errorText = generate.isError ? t("brief.generateError") : isError ? t("brief.loadError") : null;
    return (
      <Card>
        <div style={s.stack}>
          <div style={s.headerRow}>
            {data?.stale ? (
              <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
                {t("brief.outdated")}
              </Badge>
            ) : (
              <span />
            )}
            <div style={s.headerActions}>
              <Button kind="secondary" size="sm" icon="RefreshCw" onClick={regenerate}>
                {t("brief.refresh")}
              </Button>
            </div>
          </div>
          {errorText && (
            <div role="alert" style={s.inlineError}>
              <span>{errorText}</span>
              <Button kind="secondary" size="sm" icon="RefreshCw" onClick={generate.isError ? regenerate : () => refetch()}>
                {t("brief.retry")}
              </Button>
            </div>
          )}
          <div>
            <div style={s.subTitle}>{t("brief.summary")}</div>
            <p style={s.summary}>{brief.summary}</p>
          </div>
          <div>
            <div style={s.subTitle}>{t("brief.risksTitle")}</div>
            <RiskList risks={brief.risks} onOpenFile={onOpenFile} />
          </div>
          <div>
            <div style={s.subTitle}>{t("brief.focusTitle")}</div>
            <FocusList items={brief.review_focus} onOpenFile={onOpenFile} />
          </div>
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
      </Card>
    );
  })();

  return <div aria-live="polite">{content}</div>;
}
