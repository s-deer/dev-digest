"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { ReviewRecord } from "@devdigest/shared";
import { BriefCard } from "../BriefCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null;
  /** PR reviews (newest first) — the brief banner takes its verdict from them. */
  reviews?: ReviewRecord[] | null;
  /** Deep-link into Files changed (line is null for a file-level link). */
  onOpenFile: (file: string, line: number | null) => void;
}

export function OverviewTab({ prBody, prId, repoId, repoFullName, headSha, reviews, onOpenFile }: OverviewTabProps) {
  const t = useTranslations("brief");
  return (
    <>
      <section>
        <SectionLabel icon="FileText">{t("brief.label")}</SectionLabel>
        <BriefCard
          prId={prId}
          repoId={repoId}
          repoFullName={repoFullName}
          headSha={headSha}
          reviews={reviews}
          onOpenFile={onOpenFile}
        />
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
