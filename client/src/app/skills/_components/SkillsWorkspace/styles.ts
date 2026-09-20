import type { CSSProperties } from "react";

export const s = {
  workspace: { display: "flex", height: "calc(100vh - 52px)", minHeight: 0 } satisfies CSSProperties,
} as const;
