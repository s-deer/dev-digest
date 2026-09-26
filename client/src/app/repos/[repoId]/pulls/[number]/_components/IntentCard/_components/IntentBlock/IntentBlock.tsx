/* IntentBlock — presentational, 1:1 with DevDigest-design/screen_pr_detail.jsx
   IntentBlock (:3-18). Renders only the quote and IN/OUT SCOPE lists —
   confidence, sources, change type and cost are deliberately not shown here
   (Intent Layer / L03 UI scope). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { s } from "../../styles";

/** Stable keys for possibly-duplicate scope text: text + index of that dupe. */
function keyedItems(items: string[]): { key: string; text: string }[] {
  const seen = new Map<string, number>();
  return items.map((text) => {
    const dupe = seen.get(text) ?? 0;
    seen.set(text, dupe + 1);
    return { key: `${text}#${dupe}`, text };
  });
}

function ScopeList({ items, color, bulletColor }: { items: string[]; color: string; bulletColor?: string }) {
  const t = useTranslations("brief");
  if (items.length === 0) {
    return (
      <ul style={s.scopeList}>
        <li style={s.scopeItem(color)}>
          <span style={s.scopeBullet(bulletColor)}>·</span>
          {t("intent.noneStated")}
        </li>
      </ul>
    );
  }
  return (
    <ul style={s.scopeList}>
      {keyedItems(items).map(({ key, text }) => (
        <li key={key} style={s.scopeItem(color)}>
          <span style={s.scopeBullet(bulletColor)}>·</span>
          {text}
        </li>
      ))}
    </ul>
  );
}

export function IntentBlock({ record }: { record: PrIntentRecord }) {
  const t = useTranslations("brief");
  return (
    <div>
      <p style={s.quote}>“{record.intent}”</p>
      <div style={s.scopeGrid}>
        <div>
          <div style={s.scopeHeader("var(--ok)")}>
            <Icon.Check size={13} />
            {t("intent.inScope")}
          </div>
          <ScopeList items={record.in_scope} color="var(--text-secondary)" bulletColor="var(--ok)" />
        </div>
        <div>
          <div style={s.scopeHeader("var(--text-muted)")}>
            <Icon.X size={13} />
            {t("intent.outOfScope")}
          </div>
          <ScopeList items={record.out_of_scope} color="var(--text-muted)" />
        </div>
      </div>
    </div>
  );
}
