import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  // marginBottom (not a parent gap) so the last group doesn't carry trailing
  // space, and GroupHeader's own marginBottom (not this) separates it from
  // its files.
  group: { display: "flex", flexDirection: "column", marginBottom: 18 } satisfies CSSProperties,
} as const;
