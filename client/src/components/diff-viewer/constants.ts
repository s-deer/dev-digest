/** Constants for the DiffViewer. */

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Scroll margin for a deep-link target so it lands fully visible below the
   sticky PR header and tab bar. Mirrors the sticky header height owned by the
   PR detail page; kept local because shared components must not import from
   `app/`. */
export const TARGET_SCROLL_OFFSET = 148;
