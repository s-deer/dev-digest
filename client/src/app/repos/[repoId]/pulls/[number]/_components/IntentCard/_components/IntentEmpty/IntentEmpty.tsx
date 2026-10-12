/* IntentEmpty — compact empty state inside the PR Brief's left card, shown
   before the PR's intent has ever been derived. No Card and no icon tile of
   its own (BriefEmpty is the large "No brief yet" card). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "../../styles";

export function IntentEmpty({ onGenerate }: { onGenerate: () => void }) {
  const t = useTranslations("brief");
  return (
    <div style={s.emptyBody}>
      <div style={s.emptyTitle}>{t("intent.emptyTitle")}</div>
      <p style={s.emptyText}>{t("intent.emptyBody")}</p>
      <div style={s.emptyActions}>
        <Button kind="primary" icon="Target" onClick={onGenerate}>
          {t("intent.generate")}
        </Button>
      </div>
    </div>
  );
}
