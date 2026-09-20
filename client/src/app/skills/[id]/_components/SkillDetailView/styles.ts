import type { CSSProperties } from "react";

export const s = {
  wrap: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, padding: "16px 24px 0", flexShrink: 0 } satisfies CSSProperties,
  mobileBack: { display: "none", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--text-muted)", textDecoration: "none" } satisfies CSSProperties,
  icon: { color: "var(--accent)", flexShrink: 0 } satisfies CSSProperties,
  name: { fontSize: 17, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  tabs: { marginTop: 14 } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto", padding: 24 } satisfies CSSProperties,
  loading: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  state: { flex: 1, minWidth: 0, minHeight: 0, display: "grid", placeItems: "center" } satisfies CSSProperties,
} as const;
