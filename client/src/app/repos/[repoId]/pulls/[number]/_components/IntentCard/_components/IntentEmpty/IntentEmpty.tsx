/* IntentEmpty — 1:1 with DevDigest-design/screen_pr_detail.jsx BriefEmpty
   (:74-83). Shown before the PR's intent has ever been generated. Replaces
   the whole PR Brief grid (full width), the same way BriefEmpty replaces
   BriefCard's whole ready-state layout. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Card, Icon } from "@devdigest/ui";
import { s } from "../../styles";

export function IntentEmpty({ onGenerate }: { onGenerate: () => void }) {
  const t = useTranslations("brief");
  return (
    <Card style={s.emptyCard}>
      <div style={s.emptyBody}>
        <div style={s.emptyIconBox}>
          <Icon.FileText size={24} style={{ color: "var(--text-muted)" }} />
        </div>
        <div style={s.emptyTitle}>{t("intent.emptyTitle")}</div>
        <p style={s.emptyText}>{t("intent.emptyBody")}</p>
        <div style={s.emptyActions}>
          <Button kind="primary" icon="FileText" onClick={onGenerate}>
            {t("intent.generate")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
