import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  group: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
