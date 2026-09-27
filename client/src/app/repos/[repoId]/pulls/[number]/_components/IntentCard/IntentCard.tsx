/* IntentCard — Intent Layer (L03) card for the Overview tab's "PR Brief"
   section. Owns the whole "PR Brief" grid: loading and empty states replace
   it full width (DevDigest-design/screen_pr_detail.jsx BriefSkeleton :65-72,
   BriefEmpty :74-83); only the ready state is the 1fr 1fr grid with Intent
   in the left Card (:120-123). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, ErrorState, SectionLabel } from "@devdigest/ui";
import { usePrIntent, useGenerateIntent } from "@/lib/hooks/intent";
import { IntentBlock } from "./_components/IntentBlock";
import { IntentEmpty } from "./_components/IntentEmpty";
import { IntentSkeleton } from "./_components/IntentSkeleton";
import { s } from "./styles";

export function IntentCard({ prId }: { prId: string | null }) {
  const t = useTranslations("brief");
  const { data: intent, isLoading, isError, refetch } = usePrIntent(prId);
  const generate = useGenerateIntent(prId);

  const content = (() => {
    if (!prId || isLoading || generate.isPending) return <IntentSkeleton />;
    if (isError) return <ErrorState body={t("intent.loadError")} onRetry={() => refetch()} />;
    if (generate.isError) {
      return <ErrorState body={t("intent.generateError")} onRetry={() => generate.mutate(false)} />;
    }
    if (!intent) return <IntentEmpty onGenerate={() => generate.mutate(false)} />;
    return (
      <div style={s.dataGrid}>
        <Card>
          <SectionLabel icon="Target">{t("intent.label")}</SectionLabel>
          <IntentBlock record={intent} />
        </Card>
      </div>
    );
  })();

  return <div aria-live="polite">{content}</div>;
}
