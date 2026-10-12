/* BriefEmpty — "No brief yet" card with the single Generate action. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Card, Icon } from "@devdigest/ui";
import { s } from "../../styles";

export function BriefEmpty({ onGenerate, disabled }: { onGenerate: () => void; disabled?: boolean }) {
  const t = useTranslations("brief");
  return (
    <Card style={s.emptyCard}>
      <div style={s.emptyBody}>
        <div style={s.emptyIconBox}>
          <Icon.FileText size={24} style={{ color: "var(--text-muted)" }} />
        </div>
        <div style={s.emptyTitle}>{t("brief.emptyTitle")}</div>
        <p style={s.emptyText}>{t("brief.emptyBody")}</p>
        <div style={s.emptyActions}>
          <Button kind="primary" icon="FileText" onClick={onGenerate} disabled={disabled}>
            {t("brief.generate")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
