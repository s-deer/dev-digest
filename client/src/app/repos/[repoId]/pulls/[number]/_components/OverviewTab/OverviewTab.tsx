"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { BriefCard } from "../BriefCard";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null;
  /** Deep-link into Files changed (line is null for a file-level link). */
  onOpenFile: (file: string, line: number | null) => void;
}

export function OverviewTab({ prBody, prId, repoId, repoFullName, headSha, onOpenFile }: OverviewTabProps) {
  const t = useTranslations("brief");
  return (
    <>
      <section>
        <SectionLabel icon="FileText">{t("intent.briefLabel")}</SectionLabel>
        <BriefCard prId={prId} onOpenFile={onOpenFile} />
      </section>

      <section>
        <SectionLabel icon="Target">{t("block.intent")}</SectionLabel>
        <IntentCard prId={prId} />
      </section>

      <section>
        <SectionLabel icon="Workflow">{t("block.blast")}</SectionLabel>
        <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
      </section>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
