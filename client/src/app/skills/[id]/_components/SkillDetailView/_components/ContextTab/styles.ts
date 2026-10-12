import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 14, maxWidth: 960 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  title: { margin: 0, fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  hint: { margin: 0, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  footer: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    borderTop: "1px solid var(--border)",
    paddingTop: 12,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  serializes: { fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", margin: "4px 0 6px" } satisfies CSSProperties,
  preview: {
    margin: 0,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
  total: { fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  warning: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg, var(--bg-hover))",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
  warningList: { margin: "6px 0 0", paddingLeft: 18 } satisfies CSSProperties,
} as const;
