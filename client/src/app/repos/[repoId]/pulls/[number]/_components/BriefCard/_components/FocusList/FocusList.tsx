/* FocusList — the brief's review-focus items in model order. Each row is one
   button reading `file:line — reason` that deep-links to that line. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BriefFocusItem } from "@devdigest/shared";
import { s } from "../../styles";

export function FocusList({
  items,
  onOpenFile,
}: {
  items: BriefFocusItem[];
  onOpenFile: (file: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  if (items.length === 0) return <p style={s.note}>{t("brief.focusEmpty")}</p>;
  return (
    <ul style={s.list}>
      {items.map((f, i) => (
        <li key={`${f.file}:${f.line}:${i}`}>
          <button type="button" style={s.focusBtn} onClick={() => onOpenFile(f.file, f.line)}>
            <span className="mono" style={{ color: "var(--accent-text)" }}>
              {f.file}:{f.line}
            </span>
            {` — ${f.reason}`}
          </button>
        </li>
      ))}
    </ul>
  );
}
