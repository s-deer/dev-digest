/* BriefGrid — two equal columns: the left Card holds Intent (and, once a brief
   exists, the Risk areas via `riskSlot`); the right column is Blast radius. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../../../IntentCard";
import { BlastRadiusCard } from "../../../BlastRadiusCard";
import { s } from "../../styles";

export function BriefGrid({
  prId,
  repoId,
  repoFullName,
  headSha,
  riskSlot,
}: {
  prId: string | null;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null;
  riskSlot?: React.ReactNode;
}) {
  const t = useTranslations("brief");
  return (
    <div style={s.grid}>
      <Card>
        <IntentCard prId={prId} />
        {riskSlot != null && (
          <>
            <div style={s.divider} />
            <SectionLabel icon="AlertTriangle">{t("brief.risksTitle")}</SectionLabel>
            {riskSlot}
          </>
        )}
      </Card>
      <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
    </div>
  );
}
