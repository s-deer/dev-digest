/* BlastStats — the "N symbols · N callers · N endpoints · N cron/jobs" row
   at the top of BlastRadiusCard, shared by loading-free states (design
   mockup: tasks/l04-blast-radius/images/blast-radius-tree-view.png). Labels
   come from blast.json's `stat.*` (fixed nouns, no pluralization). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@devdigest/ui";
import type { BlastStatsCounts } from "../../helpers";
import { s } from "../../styles";

const ITEMS: ReadonlyArray<{ key: keyof BlastStatsCounts; icon: IconName }> = [
  { key: "symbols", icon: "Code" },
  { key: "callers", icon: "CornerDownRight" },
  { key: "endpoints", icon: "Globe" },
  { key: "crons", icon: "Clock" },
];

export function BlastStats({ counts }: { counts: BlastStatsCounts }) {
  const t = useTranslations("blast");
  return (
    <div style={s.statsRow}>
      {ITEMS.map(({ key, icon }) => {
        const ItemIcon = Icon[icon];
        return (
          <span key={key} style={s.statItem}>
            <ItemIcon size={13} style={s.statIcon} />
            <strong>{counts[key]}</strong> {t(`stat.${key}`)}
          </span>
        );
      })}
    </div>
  );
}
