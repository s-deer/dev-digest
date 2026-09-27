import type { CSSProperties } from "react";

/** Co-located styles for FindingComment — a simpler FindingCard for inline
   use in the diff. */
export const s = {
  card: (muted: boolean): CSSProperties => ({
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    overflow: "hidden",
    opacity: muted ? 0.6 : 1,
  }),
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    cursor: "pointer",
  } satisfies CSSProperties,
  title: (muted: boolean, dismissed: boolean): CSSProperties => ({
    fontSize: 13,
    fontWeight: 600,
    color: muted ? "var(--text-muted)" : "var(--text-primary)",
    textDecoration: dismissed ? "line-through" : "none",
    flex: 1,
    minWidth: 0,
  }),
  tag: (color: string): CSSProperties => ({ fontSize: 11.5, fontWeight: 600, color, flexShrink: 0 }),
  chevron: (expanded: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: expanded ? "rotate(180deg)" : "none",
    transition: "transform .15s",
    flexShrink: 0,
  }),
  body: { padding: "0 10px 10px" } satisfies CSSProperties,
  prose: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    marginTop: 8,
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, marginTop: 10 } satisfies CSSProperties,
} as const;
