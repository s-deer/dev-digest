import type { CSSProperties } from "react";

export const s = {
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 14,
  } satisfies CSSProperties,
  toolbarLeft: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 } satisfies CSSProperties,
  summary: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  summaryAdd: { color: "var(--code-add-text)" } satisfies CSSProperties,
  summaryDel: { color: "var(--code-del-text)" } satisfies CSSProperties,
  notInDiff: {
    padding: "8px 12px",
    marginBottom: 14,
    borderRadius: 6,
    fontSize: 13,
    color: "var(--warn)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,
  noReview: { fontSize: 12.5, color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
} as const;
