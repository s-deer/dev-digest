/** Evidence limits, prompt tuning, and confidence scoring for the Intent Layer (L03). */

export const MAX_ISSUES = 2;
export const MAX_DOCS = 3;
export const DOC_MAX_CHARS = 12_000;
export const DOCS_TOTAL_MAX_CHARS = 30_000;
export const ISSUE_BODY_MAX_CHARS = 6_000;
export const DESCRIPTION_MAX_CHARS = 4_000;
export const MAX_COMMITS = 30;
export const COMMIT_SUBJECT_MAX_CHARS = 200;
export const MAX_FILE_PATHS = 150;
export const MAX_EXTERNAL_REFS = 10;
export const SUBSTANTIVE_DESCRIPTION_MIN_CHARS = 150;

export const DOC_EXTENSIONS = ['.md', '.mdx', '.txt', '.rst', '.adoc'] as const;

/** Repo-relative path hint for plan/spec docs: a directory segment, or a basename keyword. */
export const DOC_PATH_HINT = /(^|\/)(docs|specs?|tasks|plans?|rfcs?|adr)\//i;
export const DOC_BASENAME_HINT = /(plan|spec|design|rfc)/i;

export const INTENT_PROMPT_VERSION = 'intent-v1';
export const INTENT_TEMPERATURE = 0;
export const INTENT_MAX_TOKENS = 900;
export const INTENT_TIMEOUT_MS = 30_000;

export const CONFIDENCE_SCORE = {
  high: 0.85,
  medium: 0.6,
  low: 0.3,
} as const;
