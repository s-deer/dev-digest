/* SpecsRead — the "Specs read" configuration value: the paths the run read,
   then the attached project docs that were skipped, each with its reason. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ProjectContextRecord } from "@devdigest/shared";
import { s } from "../../styles";

export function SpecsRead({ paths, records }: { paths: string[]; records: ProjectContextRecord[] | undefined }) {
  const t = useTranslations("runs");
  const skipped = (records ?? []).filter((r) => r.status === "skipped");
  return (
    <div style={s.specsWrap}>
      {paths.length === 0 && skipped.length === 0 && <span style={s.specsNone}>{t("trace.config.none")}</span>}
      {paths.map((sp) => (
        <span key={sp} className="mono" style={s.spec}>
          {sp}
        </span>
      ))}
      {skipped.map((r) => (
        <span key={`${r.section}:${r.path}`} className="mono" style={s.specSkipped}>
          {r.path} — {t("trace.config.skipped", { reason: t(`trace.config.reason.${r.reason ?? "unreadable"}`) })}
        </span>
      ))}
    </div>
  );
}
