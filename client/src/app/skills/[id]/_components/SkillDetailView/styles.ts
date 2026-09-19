import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", minHeight: "calc(100vh - 52px)" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, padding: "16px 24px 0", flexWrap: "wrap" } satisfies CSSProperties,
  back: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--text-muted)", textDecoration: "none" } satisfies CSSProperties,
  name: { fontSize: 17, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  tabs: { marginTop: 14 } satisfies CSSProperties,
  body: { flex: 1, padding: 24, maxWidth: 900, width: "100%" } satisfies CSSProperties,
  loading: { padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
} as const;
