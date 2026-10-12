/**
 * Project Context (attach repository docs to agents/skills) tunables.
 * See `server/docs/project-context.md`. Numbers are tokens (the spec says
 * "maximum tokens") counted over the WRAPPED block text the model sees
 * (`renderProjectDocBlock`), so the pre-run warning and the run agree (AC-44).
 * The UI renders these via the `limits` field of the responses; it never
 * recomputes them.
 */

/** One wrapped document above this is skipped as `over_budget` (≈ Intent Layer's 12 000 chars). */
export const DOC_CAP_TOKENS = 3000;

/** All attached documents injected into one run (≈ Intent Layer's 30 000 chars). */
export const RUN_BUDGET_TOKENS = 7500;

/** Max documents in one (owner, repo) attachment set. Mirrors `SetProjectContextBody`. */
export const MAX_ATTACHMENTS_PER_SET = 50;

/** A blob above this is never read; its tokens are approximated as `ceil(size / 4)`. */
export const MAX_READ_BYTES = 262_144;

/** The preview endpoint refuses a blob larger than this (user-initiated single read). */
export const MAX_PREVIEW_BYTES = 2_097_152;

/** Max concurrent `git show` reads while listing / resolving. */
export const READ_CONCURRENCY = 16;

/** Bounded `sha:path` → tokens cache so a refresh of an unchanged tip does not re-read blobs. */
export const TOKEN_CACHE_MAX_ENTRIES = 5000;

/** Longest accepted repo-relative document path. */
export const MAX_PATH_CHARS = 512;

/** Folder names that give a document its type, nearest to the file wins. */
export const DOC_TYPE_SEGMENTS = ['specs', 'docs', 'insights'] as const;
