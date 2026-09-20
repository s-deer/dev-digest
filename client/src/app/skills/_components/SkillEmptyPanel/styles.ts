import type { CSSProperties } from "react";

export const s = {
  panel: { flex: 1, minWidth: 0, minHeight: 0, display: "grid", placeItems: "center" } satisfies CSSProperties,
} as const;
