/* IntentCard — Intent Layer (L03) content for the PR Brief block. It renders
   no Card of its own: BriefGrid owns the left Card and embeds this. The
   "Intent" heading appears only in the ready state; loading and error render
   without a heading, the empty state is compact. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, SectionLabel } from "@devdigest/ui";
import { usePrIntent, useGenerateIntent } from "@/lib/hooks/intent";
import { IntentBlock } from "./_components/IntentBlock";
import { IntentEmpty } from "./_components/IntentEmpty";
import { IntentSkeleton } from "./_components/IntentSkeleton";

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
      <div>
        <SectionLabel icon="Target">{t("intent.label")}</SectionLabel>
        <IntentBlock record={intent} />
      </div>
    );
  })();

  return <div aria-live="polite">{content}</div>;
}
