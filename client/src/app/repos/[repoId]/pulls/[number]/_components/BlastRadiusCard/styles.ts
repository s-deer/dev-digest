import type { CSSProperties } from "react";

export const s = {
  cardHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  } satisfies CSSProperties,

  viewToggle: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    borderRadius: 7,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,

  viewButton: {
    border: "none",
    background: "transparent",
    borderRadius: 5,
    padding: "4px 10px",
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-muted)",
    cursor: "pointer",
  } satisfies CSSProperties,

  viewButtonActive: {
    background: "var(--bg-hover)",
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  statsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 18,
    marginBottom: 0,
  } satisfies CSSProperties,

  statItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  statIcon: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  degradedBadge: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  } satisfies CSSProperties,

  degradedReason: {
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  noDownstream: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,

  symbolList: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  } satisfies CSSProperties,

  symbolGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,

  symbolHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  } satisfies CSSProperties,

  symbolHeaderButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    border: "none",
    background: "transparent",
    padding: 0,
    font: "inherit",
    color: "inherit",
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,

  symbolName: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  callerCount: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  callerList: {
    listStyle: "none",
    margin: 0,
    marginLeft: 6,
    padding: 0,
    paddingLeft: 12,
    borderLeft: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 5,
  } satisfies CSSProperties,

  callerItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
  } satisfies CSSProperties,

  callerIcon: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  callerName: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  chipGroups: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 4,
  } satisfies CSSProperties,

  chipGroup: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,

  chipGroupLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  } satisfies CSSProperties,
} as const;
