/* DiffTab/constants.ts — Smart Diff group presentation: colour, i18n label/hint
   key and default collapse state per role. Colours reuse existing UI tokens
   (@devdigest/ui severity vars via CSS custom properties) — no new palette. */
import type { SmartDiffRole } from "@devdigest/shared";

/** Roles collapsed the first time Smart order renders (P1: docs + boilerplate
   are noise; core/tests/wiring want eyes on them). */
export const COLLAPSED_BY_DEFAULT: SmartDiffRole[] = ["docs", "boilerplate"];

/** Colour square shown on each group's header. */
export const ROLE_COLOR: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  tests: "var(--ok)",
  wiring: "var(--warn)",
  docs: "var(--info)",
  boilerplate: "var(--text-muted)",
};

/** `prReview.smartDiff` key for each role's short label ("Core", "Tests", …). */
export const ROLE_LABEL_KEY: Record<SmartDiffRole, string> = {
  core: "smartDiff.coreLabel",
  tests: "smartDiff.testsLabel",
  wiring: "smartDiff.wiringLabel",
  docs: "smartDiff.docsLabel",
  boilerplate: "smartDiff.boilerplateLabel",
};

/** `prReview.smartDiff` key for each role's one-line hint. */
export const ROLE_HINT_KEY: Record<SmartDiffRole, string> = {
  core: "smartDiff.coreHint",
  tests: "smartDiff.testsHint",
  wiring: "smartDiff.wiringHint",
  docs: "smartDiff.docsHint",
  boilerplate: "smartDiff.boilerplateHint",
};

/** Approximate rendered height of the sticky `PrDetailHeader` (title + meta +
   tabs), so a group header sticking at the same `top: 0` doesn't slide
   underneath it. Not pixel-exact — there's no shared layout token for it yet. */
export const STICKY_TOP_OFFSET = 132;
