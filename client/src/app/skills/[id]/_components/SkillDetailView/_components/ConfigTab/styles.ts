import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  headingRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18 } satisfies CSSProperties,
  headingGroup: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } satisfies CSSProperties,
  heading: { margin: 0, fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  enabledGroup: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 } satisfies CSSProperties,
  enabledLabel: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 10 } satisfies CSSProperties,
  danger: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginTop: 32,
    padding: "14px 16px",
    border: "1px solid var(--crit-bg)",
    borderRadius: 8,
  } satisfies CSSProperties,
  dangerTitle: { fontSize: 13.5, fontWeight: 600 } satisfies CSSProperties,
  dangerBody: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
} as const;
