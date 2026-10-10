import type { CSSProperties } from "react";

export const s = {
  stack: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,

  summary: {
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    margin: 0,
    textWrap: "pretty",
  } satisfies CSSProperties,

  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  } satisfies CSSProperties,

  headerActions: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,

  subTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,

  note: { fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.45, margin: 0 } satisfies CSSProperties,

  inlineError: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 6,
    fontSize: 13,
    color: "var(--crit)",
    background: "var(--crit-bg)",
  } satisfies CSSProperties,

  emptyCard: { display: "grid", placeItems: "center", minHeight: 220 } satisfies CSSProperties,
  emptyBody: { textAlign: "center", maxWidth: 360 } satisfies CSSProperties,
  emptyTitle: { fontSize: 15, fontWeight: 700, marginBottom: 6 } satisfies CSSProperties,
  emptyText: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-muted)",
    marginBottom: 18,
  } satisfies CSSProperties,

  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,

  riskTitleRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  riskTitle: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  riskText: {
    fontSize: 12.5,
    lineHeight: 1.45,
    color: "var(--text-secondary)",
    margin: "3px 0 5px",
  } satisfies CSSProperties,

  severity: (color: string) =>
    ({
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontSize: 11,
      fontWeight: 600,
      color,
    }) satisfies CSSProperties,

  fileRefs: { display: "flex", flexWrap: "wrap", gap: 6 } satisfies CSSProperties,

  linkBtn: {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontSize: 12,
    color: "var(--accent-text)",
    textAlign: "left",
    wordBreak: "break-all",
  } satisfies CSSProperties,

  focusBtn: {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontSize: 12.5,
    lineHeight: 1.45,
    color: "var(--text-secondary)",
    textAlign: "left",
  } satisfies CSSProperties,
} as const;
