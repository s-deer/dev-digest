/* FocusList — the brief's review-focus items in model order, as an <ol>. Each
   row is one button named `file:line — reason` that deep-links to that line. */
"use client";

import React from "react";
import type { BriefFocusItem } from "@devdigest/shared";
import { s } from "../../styles";

const HOVER_BG = "var(--bg-hover)";

export function FocusList({
  items,
  onOpenFile,
}: {
  items: BriefFocusItem[];
  onOpenFile: (file: string, line: number | null) => void;
}) {
  return (
    <ol style={s.list}>
      {items.map((f, i) => {
        const ref = `${f.file}:${f.line}`;
        return (
          <li key={`${ref}:${i}`}>
            <button
              type="button"
              style={s.focusBtn}
              onMouseEnter={(e) => (e.currentTarget.style.background = HOVER_BG)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              onClick={() => onOpenFile(f.file, f.line)}
            >
              <span aria-hidden="true" style={s.focusMarker}>
                ▸
              </span>
              <span className="mono" title={ref} style={s.focusRef}>
                {ref}
              </span>
              <span style={s.focusReason}>{`— ${f.reason}`}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
