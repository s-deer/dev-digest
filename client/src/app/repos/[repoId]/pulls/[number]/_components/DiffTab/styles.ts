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
  summary: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  noReview: { fontSize: 12.5, color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
} as const;
