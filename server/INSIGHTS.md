# server insights

Non-obvious lessons learned while working here — what was tried, what didn't
work, and why. One entry per insight (date + short title + a few lines),
newest last. Skip routine changes; only record what would otherwise get
re-discovered the hard way.

## What works

### 2026-09-19 · In a structured-output schema, fields the model must judge go after the fields it observes
- **Context:** any `completeStructured` schema that asks for a classification or score next to extracted facts (conventions extraction, findings).
- **Insight:** Field order is generation order. On a live conventions scan, putting `category`/`confidence` first gave all 12 candidates `imports` and a flat 0.90. Putting them after `rule`, the evidence and an `occurrences` count gave 5 categories and a 0.50–0.95 spread on the same sample.
- **Do:** ALWAYS order schema fields observe → count → classify → score. NEVER put `category`/`confidence`/`severity` first for readability.
- **Evidence:** commit `641b637` (`server/src/modules/conventions/prompt.ts`, `docs/specs/conventions.md` §5.2); angular-osf scan with deepseek-v4-flash.

## Decisions

### 2026-09-19 · Skill activation is an agent attachment concern, not only a global skill flag
- **Context:** `skills.enabled` and `agent_skills.enabled` during Skills feature implementation.
- **Insight:** A reusable skill may be active for one agent and disabled for another; the global switch is only a workspace-wide kill switch. Review execution requires both flags before adding a body to the prompt.
- **Do:** Store and validate `agent_skills.enabled`, filter both flags in `modules/reviews/run-executor.ts`, and expose the attachment state through `GET/POST /agents/:id/skills`.
- **Evidence:** User-confirmed scope decision; `server/src/db/schema/agents.ts`, `server/src/modules/agents/routes.ts`, `server/src/modules/reviews/run-executor.ts`.

### 2026-09-19 · SSE completion is not background-runner liveness
- **Context:** cancellation of `agent_runs` through `ReviewService.cancelRun` and `RunBus`.
- **Insight:** `RunBus.complete()` closes the stream and clears cancellation, but an executor can still be running; using completion to detect an orphan lets the executor overwrite `cancelled` with `done`.
- **Do:** Track active executors separately, leave live runs for the executor to complete, and guard terminal persistence with `status='running'`.
- **Evidence:** `server/src/platform/sse.ts`, `modules/reviews/service.ts`, `modules/reviews/repository/run.repo.ts`, and the in-flight cancellation integration test.

### 2026-09-17 · Timeline findings breakdown is a read-time join on `reviews.run_id`, not denormalized onto `agent_runs`
- **Context:** `RunSummary.findings` in `listRunsForPull`; `PrMeta.findings` on `GET /repos/:id/pulls`
- **Insight:** The hover tooltip needs each finding's details (title, file:line, rationale), which counts stored on `agent_runs` can't carry. Stored counts would also go stale when a finding is dismissed and would be missing for old runs. The PR list uses only the latest review, the same one the score comes from. Both surfaces skip dismissed findings. This reverses the older "findings intentionally not surfaced on the list" note that used to be in `routes.ts`.
- **Do:** ALWAYS fold rows through `summarizeFindings` (`modules/reviews/findings-summary.ts`). NEVER add severity-count columns to `agent_runs` for display.
- **Evidence:** `server/src/modules/reviews/repository/run.repo.ts:57`, `server/src/modules/pulls/routes.ts:145`, test "findings breakdown on runs + PR list" in `server/test/reviews.it.test.ts`

## Gotchas & recurring errors

### 2026-09-15 · The server and client copies of `@devdigest/shared` have already drifted apart
- **Context:** any contract change in `server/src/vendor/shared` that also has to reach `client/src/vendor/shared`
- **Insight:** The two vendored copies are not identical: `diff -rq` shows `adapters.ts`, `contracts/{trace,eval-ci,knowledge,productionize}.ts` differ. If you copy a whole file from server over client, you silently pull in (or revert) unrelated changes.
- **Do:** ALWAYS port only the targeted diff of your contract change into the client copy. NEVER overwrite whole files. Run `diff -rq server/src/vendor/shared client/src/vendor/shared` before and after.
- **Evidence:** `diff -rq server/src/vendor/shared client/src/vendor/shared` (5 files differ, 2026-09-15)

### 2026-09-19 · `pnpm typecheck` does not type-check `server/test/**`
- **Context:** changing a `@devdigest/reviewer-core` or `@devdigest/shared` signature that tests also call.
- **Insight:** `server/tsconfig.json` includes only `src/**/*.ts`, so a test still passing the old shape (e.g. `skills: string[]` to `assemblePrompt`) compiles cleanly and fails only at vitest runtime with an unrelated-looking `TypeError: Cannot read properties of undefined (reading 'trim')`.
- **Do:** After a signature change, run `pnpm exec vitest run --exclude '**/*.it.test.ts'` too (and `grep -rn <symbol> server/test`), not just `pnpm typecheck`.
- **Evidence:** `server/tsconfig.json:28`; `server/test/prompt-callers.test.ts`, `server/test/prompt-structured.test.ts`.

### 2026-09-19 · `repoIntel.getConventionSamples()` never returns config files, despite its name
- **Context:** building the conventions sample (hw_2 criterion 39: "configs + top-12 via `getConventionSamples()`").
- **Insight:** It is `getTopFilesByRank` filtered by `JUNK_PATH_PATTERNS`, which drops `eslint`, `prettier`, `.config.`, tests and migrations. It also returns `[]` when `repoIntelEnabled` is off or the repo isn't indexed. `MockGitClient.readFile` returns `''` for unknown paths instead of throwing.
- **Do:** Read configs through an explicit path list with `container.git.readFile`, and treat both `''` and a throw as "missing". Fail with 422 *before* the LLM call when there are zero source samples.
- **Evidence:** `server/src/modules/repo-intel/service.ts:635`, `JUNK_PATH_PATTERNS` at `:718`; `server/src/adapters/mocks.ts:298`.

### 2026-09-19 · DB-backed convention tests must clear seeded candidates before asserting counts
- **Context:** `server/test/conventions.it.test.ts` runs against the shared seed fixture.
- **Insight:** The seed intentionally contains an accepted convention for the e2e flow, so extraction assertions that expect one candidate or an empty rejected/default list become order- and fixture-dependent.
- **Do:** Delete the repository's conventions and scans in the integration test setup before exercising extraction behavior; keep the seeded rows for browser tests.
- **Evidence:** `server/test/conventions.it.test.ts:34-36`, `server/src/db/seed.ts`.

### 2026-09-19 · Drizzle numeric columns typed as numbers still serialize as strings
- **Context:** response serialization for `ConventionScan.cost_usd` after a real Postgres write.
- **Insight:** `$type<number>()` changes the TypeScript type but does not coerce the Postgres driver's string result, so Fastify's response schema rejects the value with `Expected number, received string`.
- **Do:** Coerce numeric database fields at the DTO boundary before returning them through a Zod response schema.
- **Evidence:** `server/src/db/schema/knowledge.ts:64`, `server/src/modules/conventions/helpers.ts:191`, `test/conventions.it.test.ts` response serialization failure.

### 2026-09-19 · Literal boolean response schemas require literal handler returns
- **Context:** Fastify routes using a Zod response such as `z.object({ ok: z.literal(true) })`.
- **Insight:** `fastify-type-provider-zod` infers the handler output as `{ ok: true }`, while TypeScript widens an async object return to `{ ok: boolean }`.
- **Do:** Return `{ ok: true as const }` for these handlers so the route response type remains aligned with the schema.
- **Evidence:** `server/src/modules/skills/routes.ts:105-109`; `pnpm typecheck` failed before the cast and passed after it.

### 2026-09-19 · `setSkills` must snapshot the locked agent row, not the caller row
- **Context:** `AgentsRepository.setSkills` receives an `AgentRow` that may have been read before its transaction starts.
- **Insight:** Locking only `agents.version` prevents concurrent version collisions but still leaves provider/model/prompt fields stale in the new `agent_versions` snapshot.
- **Do:** Reload the complete agent with `FOR UPDATE` and build both the next version and snapshot config from that row.
- **Evidence:** `server/src/modules/agents/repository.ts`; regression test `server/test/agents-versions.it.test.ts`.

### 2026-09-19 · Postgres `numeric` values need conversion before numeric response serialization
- **Context:** changing a Drizzle `numeric('cost_usd').$type<number>()` column used by a Fastify response schema.
- **Insight:** `postgres` returns `numeric` values as strings at runtime; `$type<number>()` changes TypeScript only, so passing the row directly to a Zod `z.number()` response produces a 500.
- **Do:** Convert numeric database values at the repository/DTO boundary before returning them to a numeric API contract.
- **Evidence:** `server/src/db/schema/knowledge.ts:65`, `server/src/modules/conventions/helpers.ts:191`, and the first extraction case in `server/test/conventions.it.test.ts`.

### 2026-09-19 · Editing an applied migration does not repair the existing database
- **Context:** correcting an unmerged migration after the local Postgres database had already recorded it in `drizzle.__drizzle_migrations`.
- **Insight:** `pnpm db:migrate` does not replay the edited migration, so the corrected SQL protects fresh databases but cannot recover data already discarded by the old sequence.
- **Do:** Check the migration table before editing; report the local-applied caveat and use a separate repair migration only when the old migration has shipped to a database containing recoverable source data.
- **Evidence:** `server/src/db/migrations/0015_drop_legacy_convention_acceptance.sql`; local `drizzle.__drizzle_migrations` through migration 0018; `pnpm db:migrate` after the edit.
