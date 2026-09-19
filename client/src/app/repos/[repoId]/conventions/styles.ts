import type { CSSProperties } from "react";

export const s = {
  page: { padding: "28px 32px 56px", maxWidth: 1180, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 22 } satisfies CSSProperties,
  title: { margin: 0, fontSize: 24, letterSpacing: "-0.03em" } satisfies CSSProperties,
  subtitle: { margin: "7px 0 0", color: "var(--text-secondary)", fontSize: 13 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" } satisfies CSSProperties,
  summary: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 } satisfies CSSProperties,
  list: { display: "grid", gap: 12 } satisfies CSSProperties,
  card: { display: "grid", gridTemplateColumns: "1fr auto", gap: 20, padding: 20, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 10 } satisfies CSSProperties,
  cardAccepted: { borderLeft: "3px solid var(--good)" } satisfies CSSProperties,
  rule: { margin: 0, fontSize: 15, lineHeight: 1.45, fontWeight: 650, fontStyle: "italic" } satisfies CSSProperties,
  rationale: { margin: "8px 0 16px", color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5 } satisfies CSSProperties,
  evidence: { padding: 12, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 7 } satisfies CSSProperties,
  evidenceTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 } satisfies CSSProperties,
  snippet: { margin: 0, overflowX: "auto", color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.55 } satisfies CSSProperties,
  cardActions: { display: "flex", flexDirection: "column", gap: 7, minWidth: 112 } satisfies CSSProperties,
  confidence: { display: "flex", alignItems: "center", gap: 8, marginTop: 14, maxWidth: 300 } satisfies CSSProperties,
  edit: { display: "grid", gap: 10 } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 } satisfies CSSProperties,
  chips: { display: "flex", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
  banner: { padding: 14, borderRadius: 8, background: "var(--accent-bg)", color: "var(--text-secondary)", lineHeight: 1.5, fontSize: 13, marginBottom: 18 } satisfies CSSProperties,
} as const;
