/** Limits and tuning for the generated PR Brief (L05). */

/** Hard cap on the first-sent input (system + user) in tokens; no diff code is ever sent. */
export const BRIEF_INPUT_BUDGET = 8000;

/** Per-source token shares; each source is tail-cut to its share before the total is checked. */
export const BRIEF_SHARES = {
  intent: 600,
  blast: 1500,
  diff_stats: 2000,
  description: 1500,
  specs: 2400,
} as const;

export type BriefSource = keyof typeof BRIEF_SHARES;

/** When the total still exceeds the budget after the shares, reduce in this order. */
export const BRIEF_REDUCTION_ORDER = ['specs', 'diff_stats', 'description'] as const satisfies readonly BriefSource[];

export const BRIEF_MAX_TOKENS = 1500;
export const BRIEF_TEMPERATURE = 0;
export const BRIEF_TIMEOUT_MS = 60_000;
export const BRIEF_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
export const BRIEF_PROMPT_VERSION = 'brief-v2';
