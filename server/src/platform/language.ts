/**
 * English-only output lives in @devdigest/reviewer-core (shared with the CI
 * runner). This is a thin re-export shim, like `platform/prompt.js`.
 */
export { ENGLISH_ONLY_RULE, isNonEnglishProse, requireEnglish, type ProseField } from '@devdigest/reviewer-core';
