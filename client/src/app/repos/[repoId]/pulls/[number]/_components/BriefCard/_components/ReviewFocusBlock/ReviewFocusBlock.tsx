/* ReviewFocusBlock — full-width "read these first" block: header with a count
   badge (only when there are items), then the ordered focus list, or the empty
   text. Model text is rendered as plain text nodes. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, SectionLabel } from "@devdigest/ui";
import type { BriefFocusItem } from "@devdigest/shared";
import { FocusList } from "../FocusList";
import { s } from "../../styles";

export function ReviewFocusBlock({
  items,
  onOpenFile,
}: {
  items: BriefFocusItem[];
  onOpenFile: (file: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  return (
    <section style={s.focusBlock}>
      <SectionLabel
        icon="ListChecks"
        right={items.length > 0 ? <Badge color="var(--accent-text)">{t("brief.focusCount", { count: items.length })}</Badge> : undefined}
      >
        {t("brief.focusTitle")}
      </SectionLabel>
      {items.length === 0 ? <p style={s.note}>{t("brief.focusEmpty")}</p> : <FocusList items={items} onOpenFile={onOpenFile} />}
    </section>
  );
}
