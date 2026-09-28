/* DegradedBadge — shown at the top of BlastRadiusCard when the repo-intel
   facade served a degraded blast radius (flag off, index failed/partial,
   repo too large, or no data yet). `role="status"` so screen readers pick up
   the reason without an extra live-region wrapper. When `onResync` is given,
   it also renders a resync action: the button while idle/in-flight, and a
   "Resync started" note once the resync request has been accepted. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { BlastDegradedReason } from "@devdigest/shared";
import { s } from "../../styles";

export function DegradedBadge({
  reason,
  onResync,
  resyncing,
  started,
}: {
  reason: BlastDegradedReason;
  onResync?: () => void;
  resyncing?: boolean;
  started?: boolean;
}) {
  const t = useTranslations("blast");
  return (
    <div role="status" style={s.degradedBadge}>
      <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
        {t("degraded.label")}
      </Badge>
      <span style={s.degradedReason}>{t(`degraded.reason.${reason}`)}</span>
      {onResync &&
        (started ? (
          <span style={s.degradedReason}>{t("resyncStarted")}</span>
        ) : (
          <Button size="sm" icon="RefreshCw" loading={resyncing} onClick={onResync}>
            {resyncing ? t("resyncing") : t("resync")}
          </Button>
        ))}
    </div>
  );
}
