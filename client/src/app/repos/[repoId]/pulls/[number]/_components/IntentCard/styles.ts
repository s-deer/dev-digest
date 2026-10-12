import type { CSSProperties } from "react";

export const s = {
  quote: {
    fontSize: 14,
    lineHeight: 1.5,
    fontStyle: "italic",
    color: "var(--text-primary)",
    marginBottom: 14,
    textWrap: "pretty",
  } satisfies CSSProperties,

  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
  } satisfies CSSProperties,

  scopeHeader: (color: string) =>
    ({
      display: "flex",
      alignItems: "center",
      gap: 5,
      fontSize: 11,
      fontWeight: 700,
      color,
      marginBottom: 7,
      letterSpacing: "0.04em",
    }) satisfies CSSProperties,

  scopeList: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 5,
  } satisfies CSSProperties,

  scopeItem: (color: string) =>
    ({
      fontSize: 12.5,
      color,
      display: "flex",
      gap: 7,
      lineHeight: 1.45,
    }) satisfies CSSProperties,

  scopeBullet: (color?: string) =>
    ({
      color,
      marginTop: 1,
    }) satisfies CSSProperties,

  emptyBody: {
    textAlign: "center",
    padding: "8px 0",
  } satisfies CSSProperties,

  emptyTitle: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 6,
  } satisfies CSSProperties,

  emptyText: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-muted)",
    marginBottom: 18,
  } satisfies CSSProperties,

  emptyActions: {
    display: "flex",
    justifyContent: "center",
  } satisfies CSSProperties,

  skeletonHeading: {
    height: 12,
    width: "40%",
    marginBottom: 14,
  } satisfies CSSProperties,

  skeletonLine: (width: string) =>
    ({
      height: 10,
      width,
      marginBottom: 9,
    }) satisfies CSSProperties,
} as const;
