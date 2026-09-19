import type { CSSProperties } from "react";
import type { DiffLine } from "./helpers";

const LINE_COLORS: Record<DiffLine["kind"], { bg: string; fg: string }> = {
  add: { bg: "var(--ok-bg)", fg: "var(--ok)" },
  del: { bg: "var(--crit-bg)", fg: "var(--crit)" },
  same: { bg: "transparent", fg: "var(--text-muted)" },
};

export const s = {
  wrap: { marginTop: 10, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" } satisfies CSSProperties,
  title: { padding: "8px 12px", fontSize: 12, fontWeight: 600, borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" } satisfies CSSProperties,
  lines: { maxHeight: 360, overflow: "auto", fontSize: 12, lineHeight: 1.55, margin: 0 } satisfies CSSProperties,
  line: (kind: DiffLine["kind"]): CSSProperties => ({
    display: "flex",
    gap: 10,
    padding: "0 12px",
    background: LINE_COLORS[kind].bg,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  }),
  sign: (kind: DiffLine["kind"]): CSSProperties => ({ width: 10, flexShrink: 0, color: LINE_COLORS[kind].fg, userSelect: "none" }),
  empty: { padding: 12, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
