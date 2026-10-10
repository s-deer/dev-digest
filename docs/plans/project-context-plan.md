# Development Plan: Project Context — attach repository docs to agents and skills
**Goal:** Let users discover Markdown docs in a repo, preview them, and attach them by hand to agents and skills per repository. At run start the attached docs are injected as untrusted blocks under `## Project context` (agent docs) and `## Project specifications` (skill docs). The run trace records what was read, and the UI shows token cost before the run.
**Source spec:** `/Users/alexey/my/dev-digest/specs/2026-10-10-project-context.md`  **Execution mode:** multi-agent, phases sequential (one implementer per phase; phases A, B, C, D below)

## 1. Context & sources consulted
- Read:
  - the approved spec in full, including D-1..D-26 and AC-1..AC-54.
  - `/Users/alexey/my/dev-digest/.claude/skills/pr-self-review/routing.md`.
  - `server/docs/intent-layer.md` and `server/src/modules/intent/constants.ts`.
  - `server/src/modules/reviews/run-executor.ts` (whole `runOneAgent` and `traceFromBuffer`).
  - `server/src/platform/trace-builder.ts`.
  - `reviewer-core/src/prompt.ts` and `reviewer-core/src/review/run.ts`.
  - `server/src/vendor/shared/contracts/trace.ts` and `contracts/platform.ts` (SpecFile/IndexStatus).
  - `server/src/vendor/shared/adapters.ts` (GitClient), `server/src/adapters/git/simple-git.ts`, `server/src/adapters/mocks.ts`, `server/src/adapters/tokenizer/index.ts`.
  - `server/src/db/schema/{agents,repos,context}.ts`, `server/src/modules/index.ts`, `server/src/platform/container.ts`.
  - Client: `lib/hooks/core.ts` (`useContextFiles`/`useReindexContext`), `lib/types.ts`, `messages/en/{context,shell,runs}.json`, `components/app-shell/helpers.ts`, `vendor/ui/nav.ts`, `vendor/ui/primitives/Markdown.tsx`, AgentEditor and SkillDetailView `constants.ts`, TraceBody/RunTraceDrawer, `client/AGENTS.md`, `server/CLAUDE.md`.
  - Not read: `client/INSIGHTS.md`, `reviewer-core/INSIGHTS.md` and the root `INSIGHTS.md` bodies. I only used the entry titles that the spec quotes plus the server INSIGHTS headings. Each phase implementer must read the INSIGHTS file of its package first.
- Applied INSIGHTS:
  - `server/INSIGHTS.md` "Skill activation is an agent attachment concern, not only a global skill flag": the skill list includes only skills where both `agent_skills.enabled` and `skills.enabled` are true. The executor already filters this way (`skillBlocks`), so the resolver receives that exact list.
  - `server/INSIGHTS.md` "The server and client copies of `@devdigest/shared` have already drifted apart": port only the targeted diff to the client copy (S2). Do not copy the whole file.
  - `server/INSIGHTS.md` "`setSkills` must snapshot the locked agent row": attachments live in their own table and never touch `agents`/`skills`/versions (AC-23).
  - `server/INSIGHTS.md` "`MockGitClient.readFile` returns `''`": test fixtures for missing and empty docs use `readFileAt` (which throws) and the new `listTree` mock.
  - `server/INSIGHTS.md` "Any `*.it.test.ts` that runs a review must mock `llm.openrouter` and `github`": applies to S12.
  - `server/INSIGHTS.md` "Drizzle numeric columns / `pnpm typecheck` does not type-check `server/test/**`": run `pnpm exec vitest run` for the test files, not only typecheck.
  - `client/INSIGHTS.md` (titles cited by the spec):
    - "RunTraceDrawer's Prompt assembly starts collapsed": click it first in tests (S18).
    - "Vendored `<Markdown>` renders headings/lists as plain text unless `.dd-md` block styles exist": check the styles in S14.
    - "Named controls need labels on the Toggle itself": give each checkbox an accessible name containing the path.
    - "`next-intl` logs MISSING_MESSAGE instead of throwing" and "Duplicate top-level JSON keys silently hide translations": assert visible strings in tests. Rewrite `context.json` as a whole file and check it has no duplicate keys.
- `git log --all --oneline -- '*project-context*'` and `'*context*'`: run it at the start of Phase B. I found no reference design. The `docs/plans/intent-layer-plan.md` design is the closest precedent for shared pre-work and the executor port.

## 2. Scope
- In scope: the whole spec (AC-1..AC-54).
  - Discovery from git objects.
  - Read-only Project Context page.
  - Agent Context tab and skill Context tab (attach, order, budget warning).
  - Attachment storage.
  - Usage lists.
  - Run-time resolution and injection into two untrusted sections.
  - Trace fields.
  - Trace drawer blocks.
  - i18n.
  - Docs.
- Out of scope: everything in the spec's non-goals. Also not planned: an e2e flow (see risks), and the CI runner (D-21).
- Assumptions and numbers set by this plan (D-12):
  - **Document cap `DOC_CAP_TOKENS = 3000` and run budget `RUN_BUDGET_TOKENS = 7500`.** They are counted in tokens (the spec says "maximum tokens") over the wrapped block text (AC-44). They follow the Intent Layer precedent of 12 000 chars per doc and 30 000 total, at about 4 chars per token. Both are server constants in `modules/project-context/constants.ts`, exposed to the UI in responses (`limits`), never recomputed on the client.
  - Other constants: `MAX_ATTACHMENTS_PER_SET = 50`, `MAX_READ_BYTES = 262_144`. A blob larger than `MAX_READ_BYTES` is not read. Its tokens are approximated as `ceil(size/4)` and it is flagged `over_cap`. It is skipped as `over_budget` at run time.
  - Default pattern `**/{specs,docs,insights}/**/*.md`. Config key: env `PROJECT_CONTEXT_PATTERNS`, `;`-separated because globs contain commas. It is read only in `platform/config.ts`.
  - Docs are read from the git object store at the synced default-branch tip. `GitClient.currentHead()` equals `origin/<branch>` after `sync()` (`reset --hard`). A new port method lists the tree at that sha and `readFileAt(sha, path)` reads blobs. This makes AC-2 (untracked), AC-3 (symlink = mode `120000`), AC-36 (run snapshot by sha) and D-9 (never the PR head) structural rather than checked after the fact.
  - **Phase placement deviation from the suggested order:** the reviewer-core renderer `renderProjectDocBlock` must exist before the server can count tokens (AC-44). The engine step (S4) therefore sits at the end of Phase A, not in Phase C. Phase C keeps the executor wiring.

## 3. Architecture & constraints
- Server: new slice `server/src/modules/project-context/` with `constants.ts`, `domain.ts`, `repository.ts`, `service.ts`, `routes.ts` (+ `server/docs/project-context.md`).
  - Ring 1 `domain.ts`: glob matcher, type derivation, path safety, budget/plan, dedupe, `buildSpecsRead`. Imports only `@devdigest/shared`.
  - Ring 2: `ProjectContextStorePort`, plus a new `GitClient.listTree` method in `vendor/shared/adapters.ts`.
  - Ring 3 `service.ts`: narrow deps `{ store, git, tokenizer, patterns, limits }`, no `Container`.
  - Ring 4: `repository.ts` (Drizzle, every query scoped by `workspaceId`), `routes.ts`, the `simple-git` adapter, and `container.ts` (lazy getter `projectContextService` plus override).
  - The run-time resolver implements a local port `ProjectContextResolver` declared in `run-executor.ts`, the same way `IntentDeriver` is. The executor never imports `modules/project-context`.
  - Routes:
    - `GET /repos/:id/project-context` (listing)
    - `GET /repos/:id/project-context/document?path=`
    - `GET|PUT /agents/:id/project-context` (query/body `repo_id`)
    - `GET|PUT /skills/:id/project-context`
    - Errors: `NotFoundError` for unknown or cross-workspace ids and for a path not in the listing. A new `AppError('project_context_repo_unavailable', …, 503)` for a missing clone. Route schemas give 422 for invalid input and for a path not in the listing on PUT.
    - The PUT body is `{repo_id, paths[]}`: unique paths, at most 50. It is a whole-set replace in one transaction.
- Client:
  - `app/repos/[repoId]/context/page.tsx` with `_components/ProjectContextView/` (`DocumentList`, `DocumentPreview`, `UsedByPopover`).
  - Shared component `client/src/components/project-context-picker/` (two consumers: agent and skill).
  - `app/agents/[id]/_components/AgentEditor/_components/ContextTab/`.
  - `app/skills/[id]/_components/SkillDetailView/_components/ContextTab/`.
  - Trace: `RunTraceDrawer/_components/{TraceBody,SpecsRead}`.
  - Hooks in `lib/hooks/project-context.ts`. These replace `useContextFiles`/`useReindexContext` in `core.ts`.
  - Messages: rewrite `messages/en/context.json`; add keys to `agents.json`, `skills.json`, `runs.json`.
  - Nav entry in `vendor/ui/nav.ts` (`activeKeyFor` in `app-shell/helpers.ts` already maps `/context`).
- Contracts (`@devdigest/shared`, both copies):
  - New `contracts/project-context.ts`: `ProjectDocType`, `ProjectDocument`, `ProjectContextListing` (documents, total_files, total_tokens, refreshed_at, patterns, limits), `ProjectDocumentRead`, `ProjectDocumentUser` (`{agent_id, agent_name, via:'direct'|'skill', skill_name|null}`), `SetProjectContextBody`, `ProjectContextAttachments`, `AgentProjectContext`, `ProjectContextSkipReason`, `ProjectContextRecord`, `ProjectContextWarning`.
  - `trace.ts`: `PromptAssembly` gets `project_specs` (nullish), `project_context_tokens` and `project_specs_tokens` (default 0). `RunTrace` gets `project_context: ProjectContextRecord[]` (default `[]`). `specs_read` stays required, since existing traces carry it.
  - `PromptAssembly.specs` now holds the `## Project context` text. The new fields default, so older traces parse (AC-43).
  - Remove `SpecFile` and `IndexStatus` and their re-exports. Nothing in server, mcp or reviewer-core uses them (grep before deleting). The client uses them only in `core.ts` and `types.ts`.
  - Adding defaulted fields makes the output type require them, so every `PromptAssembly` literal must be updated: `traceFromBuffer`, `emptyPromptAssembly`, `RunTraceDrawer.test.tsx` fixtures.
  - The old `SpecFile`/`IndexStatus` and the `chunks`/`chunks_indexed` wording are dropped (D-3).
- DB / migrations: new table `project_context_attachments`, edited in `server/src/db/schema/context.ts` (or a new `project-context.ts` in the schema folder, re-exported by `schema.ts`), then `pnpm db:generate` and `pnpm db:migrate`. No hand-written migration.
  - Columns: `id uuid pk`, `workspace_id` FK cascade, `repo_id` FK cascade, `owner_kind text` (CHECK in `agent`,`skill`), `agent_id` nullable FK→agents cascade, `skill_id` nullable FK→skills cascade, `path text`, `position int`, `created_at`.
  - CHECK: exactly one owner column is set and it matches `owner_kind`.
  - Partial unique indexes: `(agent_id, repo_id, path)` where `agent_id` is not null, and `(skill_id, repo_id, path)` where `skill_id` is not null.
  - Indexes: `(agent_id, repo_id, position)`, `(skill_id, repo_id, position)`, `(repo_id)`, `(workspace_id)`.
  - Using two real FKs gives AC-49 cascades with no hand-written deletes. A separate table means no version rows and no `agents`/`skills` update (AC-23).

## 4. Steps

### Phase A: contracts, DB, engine

### S1 — Shared contracts (server copy)  [package: shared] [depends on: —]
- AC: AC-1, AC-6, AC-8, AC-12, AC-16, AC-18, AC-19, AC-26, AC-38, AC-39, AC-40, AC-43, AC-44, AC-51, AC-53, AC-54
- Files: create `server/src/vendor/shared/contracts/project-context.ts` · modify `server/src/vendor/shared/contracts/trace.ts`, `contracts/platform.ts` (remove `SpecFile`, `IndexStatus`), `server/src/vendor/shared/index.ts` (export the new file, fix the header comment), `server/src/vendor/shared/adapters.ts` (add `TreeEntry` and `GitClient.listTree(repo, ref): Promise<TreeEntry[]>` where `TreeEntry={path, mode, size, sha}`)
- Change: define the schemas listed in section 3. `ProjectContextRecord = {path, section:'project_context'|'project_specifications', source, order, tokens, status:'injected'|'skipped', reason?}`. Reasons are `missing|unreadable|untracked|not_matched|unsafe|empty|over_budget|repo_unavailable`. `ProjectContextAttachments` carries `items[{path,tokens,missing,over_cap}]`, `total_tokens`, `would_skip[{path,section}]` and `limits`. `AgentProjectContext` adds `inherited[{path,via_skill_id,via_skill_name,tokens,missing,over_cap}]` and `totals{context_tokens,specs_tokens,total}`. Use `.default()` or `.nullish()` for every new trace field. Run `grep -rn "SpecFile\|IndexStatus"` across server, reviewer-core and mcp before deleting.
- Skills & rules: `zod` — "export schema and inferred type with the same name; validate at the boundary; `z.enum` for fixed sets; new trace fields defaulted so older documents still parse"; `onion-architecture` — "contract first, in shared, before consumers"; `typescript-expert` — "no `any`"
- Tests: update `server/test/contracts.test.ts` (hermetic): an old trace (no new fields) parses to defaults. `SetProjectContextBody` rejects duplicate paths and more than 50 paths.
- Acceptance: schemas compile. Old-trace parse test passes.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/contracts.test.ts`. Typecheck fails here at `trace-builder.ts` and `run-executor.ts` literals until S11. Fix those literals minimally in this step by adding the defaulted fields to the `emptyPromptAssembly` and `traceFromBuffer` literals so the repo compiles.

### S2 — Port contracts to the client copy  [package: shared] [depends on: S1]
- AC: same as S1 (AC-1, AC-6, AC-12, AC-18, AC-26, AC-39, AC-43, AC-51, AC-53, AC-54)
- Files: create `client/src/vendor/shared/contracts/project-context.ts` · modify `client/src/vendor/shared/contracts/trace.ts`, `contracts/platform.ts`, `client/src/vendor/shared/index.ts`, `client/src/vendor/shared/adapters.ts` only if it holds `GitClient` (check; skip if absent), `client/src/lib/types.ts` (drop the `SpecFile`/`IndexStatus` re-exports and add the new ones), `client/src/lib/hooks/core.ts` (delete `useContextFiles`/`useReindexContext` and their imports; the replacement hooks come in S13)
- Change: port only the targeted diff. Do not copy the whole file, because the two copies have drifted. The client `RunTrace.specs_read` line differs by one line number, so edit in place.
- Skills & rules: `zod` — "contracts identical in both copies for the touched schemas"; `react-architecture` — "API types come from the shared package and are never redeclared"
- Tests: update the `RunTraceDrawer.test.tsx` fixture literals so the client typechecks (`project_specs`, token fields, `project_context: []`).
- Acceptance: client typechecks. Both copies export the same names (diff the two new-contract files byte for byte).
- Verify: `cd client && pnpm typecheck`; `diff server/src/vendor/shared/contracts/project-context.ts client/src/vendor/shared/contracts/project-context.ts`

### S3 — DB schema + generated migration  [package: server] [depends on: S1]
- AC: AC-23, AC-26, AC-48, AC-49, EC-16, NFR-3
- Files: modify `server/src/db/schema/context.ts` (or create `server/src/db/schema/project-context.ts` and re-export it from `server/src/db/schema.ts`) · generated `server/src/db/migrations/0021_*.sql` and `meta/*` (via `pnpm db:generate`; never edit)
- Change: add the `project_context_attachments` table described in section 3. Use `timestamptz` and `text`. Add FK indexes by hand because Postgres does not create them. Export the row type through `db/rows.ts` only if the repository needs it.
- Skills & rules: `drizzle-orm-patterns` — "FKs as arrow functions; `$inferSelect`/`$inferInsert`; generate+migrate, never `push`"; `postgresql-table-design` — "TEXT not varchar, TIMESTAMPTZ, CHECK for the owner XOR, index every FK, ON DELETE CASCADE explicit"
- Tests: covered by the S7 `*.it.test.ts` (cascade).
- Acceptance: `pnpm db:generate` produces one new migration containing the table, the CHECKs and the indexes. `pnpm db:migrate` applies cleanly.
- Verify: `cd server && pnpm db:generate && pnpm db:migrate && pnpm typecheck`

### S4 — reviewer-core: two untrusted sections + shared block renderer  [package: reviewer-core] [depends on: S1]
- AC: AC-28, AC-29, AC-30, AC-31, AC-33, AC-40, AC-44, AC-50, NFR-8
- Files: modify `reviewer-core/src/prompt.ts`, `reviewer-core/src/review/run.ts` (add `projectContext`/`projectSpecs` to `ReviewInput` and pass them through `promptParts`), `reviewer-core/src/index.ts` (export `renderProjectDocBlock` and the `ProjectDocInput` type), `reviewer-core/test/prompt.test.ts` · modify `reviewer-core/README.md` (prompt slots table)
- Change:
  - Add `ProjectDocInput = {path, content, tokens}` and `renderProjectDocBlock(doc) = wrapUntrusted('project-doc:' + sanitizePath(path), content.trim())`. The server counts tokens over exactly this string (AC-44). Strip or replace `"`, `<`, `>`, backticks and newlines in the path label, as a second defence after the server allowlist. `wrapUntrusted` already neutralises `</untrusted>` in the content.
  - `PromptParts` gets `projectContext?: ProjectDocInput[]` and `projectSpecs?: ProjectDocInput[]`. `## Project context` is built from the legacy `specs` chunks (if any) plus `projectContext` blocks, joined with blank lines. It is omitted when empty. `## Project specifications` is rendered immediately after it, or takes its place when the context section is absent. It is omitted when empty, so with no docs the prompt is byte-identical to today.
  - Assembly: `specs` = the context text. New `project_specs` = the specifications text. `project_context_tokens`/`project_specs_tokens` = sums of the caller-supplied `tokens`, the same pattern as `skills_tokens`.
  - Both sections sit inside the existing `<untrusted>` wrappers, so the existing `INJECTION_GUARD` (which covers `<untrusted>` blocks) applies. Add "attached project documents" to the guard's list of data blocks so the guard text names them. Guard text change = prompt change for all agents, but only when sections are present; check that `prompt.test.ts` guard snapshots, if any, are updated deliberately.
  - Map-reduce: `assemblePrompt` is per chunk, so both sections repeat per call, which is the cost already stated in NFR-4.
- Skills & rules: `typescript-expert` — "pure, exported types, exhaustive handling, no `any`"; `zod` — "types from `@devdigest/shared`"; `security` (not preloaded; the file matches the content route) — flag delimiter breakout, path in the delimiter attribute, no document text in logs
- Tests: update `reviewer-core/test/prompt.test.ts` (hermetic), covering:
  - agent docs under `## Project context`, skill docs under `## Project specifications` right after it;
  - each section absent when empty, and no-docs output byte-identical to the baseline;
  - an injected `</untrusted>` is neutralised;
  - a path containing `"><script>` cannot break the attribute;
  - the token fields equal the sum of the doc tokens.
  - Also `test/run.test.ts`: the mock LLM gets the same number of calls with and without docs (AC-31).
- Acceptance: reviewer-core tests and typecheck pass. Server typecheck still passes (the `server` consumes reviewer-core source).
- Verify: `cd reviewer-core && npm test && npm run typecheck`; `cd server && pnpm typecheck`

### Phase B: server discovery, reading, attachments

### S5 — Git adapter: `listTree`  [package: server] [depends on: S1]
- AC: AC-2, AC-3, AC-36, EC-3, EC-20, EC-21, NFR-1
- Files: modify `server/src/adapters/git/simple-git.ts`, `server/src/adapters/mocks.ts` (`MockGitClient.listTree` plus an `opts.tree` fixture) · create `server/test/git-list-tree.it.test.ts` (or extend an existing git adapter test, if one exists)
- Change: `listTree(repo, ref)` runs `git ls-tree -r -l -z <ref>` via `raw()` (argv, no shell). `ref` must pass the existing `HEX_SHA` check. Parse the NUL-separated records into `{path, mode, size, sha}`. Only blobs are returned. Mode `120000` (symlink) and `160000` (submodule) are reported so the service can reject them. Paths are never joined to the filesystem. Reading goes through the existing `readFileAt(sha, path)`, which already re-validates path safety. The mock returns `opts.tree ?? []`. Mock `readFileAt` still throws on missing keys.
- Skills & rules: `onion-architecture` — "SDKs only in adapters; new I/O has a port, an adapter, a mock, and a container override (git already exists)"; `security` — "argv only, validate ref and path before they reach git, no shell"
- Tests: IT against a real temp git repo (init, commit a normal file, a symlink, and an untracked file, plus a `node_modules/pkg/docs/a.md` ignored by `.gitignore`). Assert the tree contains the tracked files only and reports the symlink mode. If the repo has no existing way to build such a fixture, create it with `simple-git` in `os.tmpdir()` inside the test.
- Acceptance: tracked files only; symlink mode surfaced; the mock satisfies the interface.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/git-list-tree`

### S6 — Domain (ring 1), constants, config  [package: server] [depends on: S1, S4]
- AC: AC-1, AC-3, AC-4, AC-5, AC-26, AC-27, AC-34, AC-38, AC-54, EC-4, EC-8, NFR-1
- Files: create `server/src/modules/project-context/constants.ts`, `server/src/modules/project-context/domain.ts` · modify `server/src/platform/config.ts` (add `projectContextPatterns`), `server/test/config.test.ts` · create `server/test/project-context-domain.test.ts`
- Change: pure functions in `domain.ts` (no `fs`, no `drizzle-orm`, no `fastify`):
  - `compilePatterns(patterns)` and `matchesPatterns(path)`. Own glob → RegExp supporting `**`, `*`, `?` and `{a,b}`. `**` matches dot-directories (D-15) and zero or more segments. Case-sensitive. No new dependency; if the implementer prefers `picomatch`, see the researcher note in section 7.
  - `isSafeDocPath(path)`: at least as strict as `safeRepoPath` in `modules/intent/domain.ts` (read it first). Allowlist `\w . - / space`; reject empty, absolute, leading `-`, backslash, NUL, `:`, a `..` or `.` segment, a `.git/` prefix; require the `.md` extension. Do not import from the intent module. Unsafe paths are never listed.
  - `docTypeFor(path)`: the nearest dirname segment (scanning from the file upwards) in `specs|docs|insights`, else `other`.
  - `planProjectContext(...)`: given the agent paths, the ordered skill groups `[{skillName, paths}]`, a per-path `{tokens, missing, overCap, status}` map and the limits, it returns the effective list. It dedupes per AC-27 (direct paths appear only in the agent list; a skill path appears once at its first position). It consumes the budget in prompt order (agent list first, then skill list), and a skipped doc consumes nothing. It returns records and `wouldSkip`. Missing docs are excluded from totals. This single function backs both the pre-run warning (AC-54) and the run-time pass (AC-34), so the two never disagree.
  - `buildSpecsRead(injectedPaths, intentRefs)`: the injected paths in prompt order, then the intent refs not already listed (AC-38, D-10).
- Skills & rules: `onion-architecture` — "ring 1 imports only `@devdigest/shared`; no I/O"; `typescript-expert` — "total functions, discriminated unions for skip reasons, exhaustive switch"; `security` — "path allowlist is the delimiter defence; test the traversal and delimiter-breaking cases"
- Tests: `server/test/project-context-domain.test.ts` (hermetic). Pattern table: `docs/a.md`, `.devdigest/specs/a.md`, `node_modules/x/docs/a.md` (matches the glob, excluded later by being untracked), and a custom pattern → `other`. Safety table: traversal, absolute, `a"b.md`, backtick, newline, `.git/x.md`. Dedupe cases (EC-8) and the budget order (cap skip, then budget skip, with a smaller later doc still fitting).
- Acceptance: all table cases pass. The config default equals the spec default pattern. `PROJECT_CONTEXT_PATTERNS="a/**/*.md;b/*.md"` parses to two patterns.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/project-context-domain.test.ts test/config.test.ts`

### S7 — Repository (ring 4)  [package: server] [depends on: S3, S6]
- AC: AC-12, AC-16, AC-17, AC-23, AC-48, AC-49, AC-53, EC-13, EC-16, EC-17, NFR-3
- Files: create `server/src/modules/project-context/repository.ts`, `server/test/project-context.it.test.ts`
- Change: implements `ProjectContextStorePort` (declared in `service.ts` or `domain.ts`, ring 2). Methods, all scoped by `workspaceId`:
  - `agentInWorkspace` / `skillInWorkspace` / `repoInWorkspace` (existence checks → NotFound).
  - `listAttachments(owner, repoId)`, ordered by `position`.
  - `replaceAttachments(owner, repoId, paths[])`: delete + insert in one transaction.
  - `listSkillAttachments(skillIds[], repoId)`.
  - `usageForRepo(workspaceId, repoId)`: `{path, agent_id, agent_name, via, skill_name}` rows from direct attachments plus attachments of skills through `agent_skills`, counting disabled agents and skills (D-16).
  - `agentSkillLinks(agentId)`: skill id, name, order, enabled flags, for the Context tab's inherited list.
  - Map rows to DTOs inside the repository. No Drizzle row types in the port signatures.
- Skills & rules: `drizzle-orm-patterns` — "transaction for replace; `inArray` for skill ids; no raw `sql` without a cast"; `onion-architecture` — "every query scoped by `workspaceId`; repositories return DTO shapes"; `postgresql-table-design`
- Tests: `server/test/project-context.it.test.ts` (DB-backed): save/reorder/replace per agent and repo; a second repo is isolated (EC-23); a cross-workspace owner → not found; deleting the agent, skill or repo removes its rows (AC-49); `agents.version` and `skills.version` unchanged after a save (AC-23); usage counts include disabled agents and skills and give the direct/via-skill split.
- Acceptance: the IT passes.
- Verify: `cd server && pnpm exec vitest run test/project-context.it.test.ts`

### S8 — Service (ring 3): discovery, preview, attachments  [package: server] [depends on: S5, S6, S7]
- AC: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-8, AC-9, AC-11, AC-12, AC-16, AC-17, AC-18, AC-19, AC-21, AC-23, AC-26, AC-44, AC-48, AC-53, AC-54, EC-2, EC-15, NFR-2, NFR-3, NFR-5
- Files: create `server/src/modules/project-context/service.ts`, `server/test/project-context-service.test.ts` · modify `server/src/adapters/mocks.ts` only if a fake is shared
- Change: `ProjectContextService` with narrow deps `{ store, git, tokenizer, patterns, limits }`.
  - `list(workspaceId, repoId)`: resolve the repo (NotFound), take `sha = git.currentHead`, `listTree(sha)`, then filter: blob, mode not `120000`/`160000`, `isSafeDocPath`, `matchesPatterns`. Read the blobs with a concurrency limit of 16 and compute `tokens = tokenizer.count(renderProjectDocBlock({path, content, tokens:0}))`. Cache tokens per `sha:path`, a bounded map of 5 000 entries. Blobs over `MAX_READ_BYTES` are not read: approximate tokens and `over_cap = true`. Fill `used_by_agents` from `usageForRepo`. Return `refreshed_at`, `patterns` and `limits`. Any git failure → `AppError('project_context_repo_unavailable', …, 503)` with no stale list (AC-11). Log paths, counts and token totals only, never content (NFR-2).
  - `read(workspaceId, repoId, path)`: the path must be in the listing (NotFound otherwise); return `content`, `tokens` and the `used_by` list (AC-53).
  - `getAttachments(owner, repoId)`: assemble items, the missing/over_cap flags, totals and `would_skip` through `planProjectContext`. For agents, add `inherited` from the enabled skills (both enable flags) and the per-section totals.
  - `setAttachments(owner, repoId, paths)`: validate every path against the current listing; on any failure throw `ValidationError` (422) and change nothing. Otherwise `replaceAttachments` and return the same shape as `getAttachments`. Never touch agent or skill versions.
- Skills & rules: `onion-architecture` — "service takes ports, throws `AppError` subclasses, no `drizzle-orm`/`fastify`; narrow deps, not `Container`"; `typescript-expert`; `security` — "no document text in logs; path validated against the listing before read or save"
- Tests: `server/test/project-context-service.test.ts` (hermetic; fake store, `MockGitClient` with `tree` and `filesAt` fixtures, mock tokenizer). Cover: listing excludes symlink, untracked and over-pattern entries and includes `.devdigest/specs`; the type badge; a custom pattern changes the result on the next call (AC-4); an invalid path rejects the whole save and the store is not called; the missing flag and the total excluding missing; the inherited list only from enabled skills; the budget warning ordering; the footer arithmetic equals the sum of the parts; a thrown git error → the `repo_unavailable` AppError. Token parity: the listing token count equals `tokenizer.count(renderProjectDocBlock(...))` for the same doc (AC-44).
- Acceptance: the hermetic suite passes. A 500-document fixture lists in under 2 s with the mocked git (a coarse regression guard for NFR-5).
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/project-context-service.test.ts`

### S9 — Routes + wiring + docs  [package: server] [depends on: S8]
- AC: AC-1, AC-6, AC-9, AC-11, AC-12, AC-16, AC-17, AC-18, AC-19, AC-24, AC-26, AC-48, AC-53, AC-54, NFR-3
- Files: create `server/src/modules/project-context/routes.ts`, `server/docs/project-context.md` · modify `server/src/modules/index.ts` (one import + one entry), `server/src/platform/container.ts` (lazy getter `projectContextService`, `ContainerOverrides.projectContextService`), `server/README.md` (API map rows)
- Change: Fastify plugin with the five routes from section 3. Each handler is: Zod `params`/`querystring`/`body`/`response` schema → `getContext` → one service call → status. Rate-limit `PUT` the way `intent` does (max 30/min). The doc covers discovery rules, the numbers (3 000 / 7 500), the token parity rule, the failure reasons and the trace fields. Add a pointer line in `server/docs/intent-layer.md`: "Project Context docs are separate from plan/spec refs; `specs_read` lists both".
- Skills & rules: `fastify-best-practices` — "schemas from shared on every route; 422 comes from the type provider, not a hand-rolled parse"; `onion-architecture` — "route = schema → getContext → one service call; one import + entry in `modules/index.ts`; getter + override in the container"; `security` — "workspace scoping on every route; `path` is only ever a query value validated against the listing"
- Tests: add route tests with `app.inject` to `server/test/project-context.it.test.ts`: 200 shapes; 422 for a bad body; 404 cross-workspace (AC-48); 503 for a missing clone (AC-11); GET document returns `used_by` with direct and `via skill` markers.
- Acceptance: all routes respond with the documented shapes. The 404/422/503 envelopes match the shared error handler.
- Verify: `cd server && pnpm typecheck && pnpm test`

### Phase C: run time, trace, tests

### S10 — Run-time resolver  [package: server] [depends on: S8]
- AC: AC-27, AC-28, AC-32, AC-33, AC-34, AC-35, AC-36, AC-44, AC-50, EC-1, EC-2, EC-3, EC-6, EC-8, EC-9, EC-11, EC-22, EC-23, NFR-5
- Files: modify `server/src/modules/project-context/service.ts` (add `resolveForRun`), `server/src/modules/project-context/domain.ts` if helpers are needed · modify `server/test/project-context-service.test.ts`
- Change: `resolveForRun({workspaceId, repoId, owner, name, agentId, skills:[{skillId,name}]})` returns `{contextDocs, specsDocs, records, injectedPaths, tokens:{context, specs}}`. Steps:
  - Take `sha = currentHead` once. All reads in the run use that sha (AC-36).
  - Load the agent list and the skill lists in skill order (the caller passes only skills that passed both enable gates).
  - Dedupe with `planProjectContext`.
  - For each doc, check in this order: absent from the tree → `missing`; present but no longer matching the patterns → `not_matched`; symlink or unsafe → `unsafe`; `readFileAt` throws → `unreadable`; trimmed empty → `empty` (EC-6; the mock returns `''` for unknown `readFile` paths, so fixtures use `readFileAt`); cap or budget exceeded → `over_budget`. The `untracked` reason is kept in the enum, but a tree-based read cannot produce it.
  - If the clone or the tree is unavailable, every attached doc gets `repo_unavailable` and the method returns normally with no docs.
  - It never throws. Docs are read with a concurrency limit and a size gate (`MAX_READ_BYTES`). Token counts use the same `renderProjectDocBlock` text as the listing.
- Skills & rules: `onion-architecture` — "no db/fs/fastify in the service; the reading goes through the git port"; `security` — "the content comes only from the default-branch sha, never the PR head; no content in logs"
- Tests: hermetic, extend the service test. Cover each skip reason, the duplicate rules (direct beats skill; several skills → once), the budget order, `repo_unavailable`, a different repo gets none, and a disabled skill's docs are absent (only the executor filters, so the test passes only the enabled ones).
- Acceptance: the tests pass. Resolving 20 docs against the mock finishes in under 500 ms (coarse guard).
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/project-context-service.test.ts`

### S11 — Executor + trace wiring  [package: server] [depends on: S4, S10]
- AC: AC-31, AC-33, AC-37, AC-38, AC-39, AC-42, AC-43, AC-45, AC-50, AC-52, NFR-9, EC-18
- Files: modify `server/src/modules/reviews/run-executor.ts`, `server/src/modules/reviews/service.ts` (pass `container.projectContextService` into the executor constructor), `server/src/platform/trace-builder.ts` · modify `server/docs/run-lifecycle-and-cost.md` (one section)
- Change:
  - Declare a local port `ProjectContextResolver` in `run-executor.ts`, like `IntentDeriver`. `Container['projectContextService']` satisfies it structurally.
  - In `runOneAgent`, declare `let resolved: ResolvedProjectContext | null = null` before the `try`. Call the resolver right after `skillBlocks` is built, passing the already filtered `skillBlocks` ids and names.
  - Pass `projectContext` and `projectSpecs` to `reviewPullRequest`. Add them only when non-empty, so an agent with no attachments gets the byte-identical prompt.
  - Live log through `runLog.info`:
    - one summary line per section: `project context: N injected (+T tokens)` and `project specifications: N injected (+T tokens)`;
    - one line per injected doc with its tokens;
    - one line per skipped doc with its reason.
  - One structured pino line per run with counts, tokens per section and skip reasons, and no content.
  - Trace on success: `specs_read = buildSpecsRead(resolved.injectedPaths, intent refs)`, `project_context = resolved.records`, and `prompt_assembly` from the engine (it already carries the two section texts and token totals).
  - Failure or cancel: pass `resolved` into `traceFromBuffer`, which fills `project_context` and `specs_read` when `resolved` is set and leaves them empty otherwise (AC-52, EC-18).
  - `buildRunTrace` gets an optional `projectContext` input defaulting to `[]`. Keep `emptyPromptAssembly` as is, with the new defaults filled.
  - Both the UI and the MCP-facing `run_agent_on_pr` path use `executeRuns`, so AC-37 holds by construction. S12 proves it.
- Skills & rules: `onion-architecture` — "executor depends on a local port, not on another module; known deviation: the executor already imports `db/schema` types, do not deepen it"; `security`; `typescript-expert`
- Tests: S12.
- Acceptance: `pnpm typecheck` passes. Existing review `*.it.test.ts` suites still pass (an agent with no attachments yields an unchanged prompt and trace).
- Verify: `cd server && pnpm typecheck && pnpm test`

### S12 — Run-time and trace integration tests  [package: server] [depends on: S11]
- AC: AC-27, AC-28, AC-29, AC-31, AC-32, AC-33, AC-34, AC-35, AC-36, AC-37, AC-38, AC-39, AC-42, AC-43, AC-44, AC-45, AC-50, AC-52, EC-5, EC-7, EC-8, EC-9, EC-14, EC-18, EC-22, EC-23
- Files: create `server/test/project-context-run.it.test.ts`
- Change: DB-backed, with `llm.openrouter` and `github` mocked in the container overrides (server INSIGHTS). The `MockGitClient` supplies `tree` and `filesAt` fixtures. Scenarios:
  - (a) the LLM call count with attachments equals the count without;
  - (b) deleted, symlinked, empty, over-cap and over-budget docs are skipped with the right reasons and the run is still `done`;
  - (c) the duplicate rule across the sections and across skills;
  - (d) a doc modified only in the PR head: the default-branch content is used (EC-22);
  - (e) a run started through the run-by-repo-and-number entry point behaves the same (AC-37);
  - (f) `specs_read` order with an Intent Layer ref appended and not duplicated;
  - (g) the trace's two section texts equal the text sent to the mock LLM;
  - (h) the listing token count equals the trace token count for an unchanged doc (AC-44);
  - (i) the records are present on a run cancelled after resolution and empty when it fails before resolution;
  - (j) an injected `</untrusted>` and "ignore all findings" content stays inside its block;
  - (k) the AC-45 scenario: a doc stating "module `api/` must not import `db/` directly", attached to an agent, appears under `## Project context` by path, and `specs_read` lists it.
  - Time resolution with 20 attachments for NFR-5.
- Skills & rules: per `TESTING.md` — "behavior at the seams, one happy path plus the edge that matters, mock the outside world via `adapters/mocks.ts`"; clear seeded rows before asserting counts
- Tests: this step is the test.
- Acceptance: all scenarios pass.
- Verify: `cd server && pnpm exec vitest run test/project-context-run.it.test.ts && pnpm test`

### Phase D: client

### S13 — Data hooks  [package: client] [depends on: S2, S9]
- AC: AC-9, AC-16, AC-17, AC-23, AC-26
- Files: create `client/src/lib/hooks/project-context.ts`, `client/src/lib/hooks/project-context.test.tsx` · modify `client/src/lib/hooks/index.ts`
- Change: hooks `useProjectDocuments(repoId)`, `useProjectDocument(repoId, path)`, `useAgentProjectContext(agentId, repoId)`, `useSetAgentProjectContext()`, `useSkillProjectContext(...)`, `useSetSkillProjectContext()`. Query keys are `["project-context", ...]`. A save mutation writes the server's saved state into the cache (EC-13). A skill save also invalidates the agent queries (the inherited rows change). Every save invalidates the listing (used-by counts). The refresh action refetches the listing. Types come from `@devdigest/shared`. Components never call `fetch`.
- Skills & rules: `react-architecture` — "server data fetch/mutation lives in hooks over `lib/api.ts`; query key factory with the feature; server state is never copied into `useState`"; `react-best-practices` — "use `useApiQuery`/`useApiMutation` if the project exposes them, errors handled in hooks"
- Tests: small hook test via `renderHook` for the invalidation behaviour only where it has logic. Otherwise it is covered through the components.
- Acceptance: the client typechecks and no references to the removed hooks remain.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S14 — Shared picker component + safe Markdown preview  [package: client] [depends on: S13]
- AC: AC-15, AC-17, AC-20, AC-21, AC-22, AC-47, NFR-6
- Files: create `client/src/components/project-context-picker/ProjectContextPicker.tsx`, `ProjectContextPicker.test.tsx`, `index.ts` (single-entry re-export) · create `client/src/components/project-context-picker/_components/{DocumentRow,PreviewDialog}/` · modify `client/src/vendor/ui/primitives/Markdown.tsx` (add an optional `blockRemoteImages` prop, default off)
- Change:
  - The picker is presentational with props `{documents, attached(ordered), missing, onChange(paths), filter, onPreview}`. Rows have a checkbox whose accessible name includes the path, the file name, the folder, the type badge, the token count and a Preview button. Order is changed with drag **and** "Move up"/"Move down" buttons (the keyboard alternative). The filter is a case-insensitive path match that never changes the attachments. A missing path is shown marked "missing" with a Detach button. With no active repo it shows the "select a repository" prompt and no controls.
  - `PreviewDialog` is focus-managed: it closes on Escape and returns focus to its trigger.
  - `Markdown` with `blockRemoteImages` renders `img` as its alt text and sets `rel="noopener noreferrer"` on links. react-markdown v9 already ignores raw HTML (no `rehype-raw`). Check that the `.dd-md` block styles exist for headings and lists (client INSIGHTS) and add them if not.
  - Honest scope: the picker has two consumers (agent tab, skill tab), which justifies the shared location.
- Skills & rules: `react-architecture` — "promote to `src/components` only with ≥2 consumers; one component per folder; no aggregating barrels"; `react-best-practices` — "no render factories, derive don't store, stable keys (use the path, not the index), `aria-label` on icon-only buttons, no `{count && …}`"; `react-testing-library` — "query by role/name, `userEvent`, 1–3 flow tests"; `next-best-practices` — "`'use client'` at the leaf"
- Tests: `ProjectContextPicker.test.tsx` — a flow: tick → counter updates → reorder with the keyboard buttons → filter → missing marker + detach; the no-repo state. A Markdown test with a `<script>` and a remote `<img>`: nothing runs and no request is made.
- Acceptance: tests pass. Checkboxes are found by role and name containing the path.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S15 — Project Context page + navigation + messages  [package: client] [depends on: S14]
- AC: AC-1, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-47, AC-53, NFR-6, NFR-7
- Files: create `client/src/app/repos/[repoId]/context/page.tsx`, `client/src/app/repos/[repoId]/context/_components/ProjectContextView/{ProjectContextView.tsx,ProjectContextView.test.tsx,index.ts}`, `…/_components/ProjectContextView/_components/{DocumentList,DocumentPreview,UsedByPopover}/` · modify `client/src/vendor/ui/nav.ts` (add `{key:"context", label:"Project Context", icon:<existing icon>, href:"/repos/:repoId/context"}` to the WORKSPACE group; pick a free `gKey` and check the shortcuts registry) · rewrite `client/messages/en/context.json`
- Change:
  - A thin `page.tsx`. `ProjectContextView` shows the list and the preview side by side. The footer reads `<N> files · <T> tokens total` plus the refreshed time (`refreshed_at`). The word "chunks" is gone. A Refresh button refetches. Empty state names the active `patterns`. Error state shows a Retry button and no stale list. Each row and the preview show "Used by N agents"; a click opens a focus-managed popover listing the agent names, each marked "direct" or "via skill <name>" and linking to `/agents/<id>`. N = 0 → no button. There is no Edit tab, no create, upload or folder action, and no coverage ring.
  - Replace `context.json` in full (no duplicate top-level keys). Remove the old `.devdigest/specs/` copy and the chunks/reindex keys. The `nav.context` label in `shell.json` already exists.
- Skills & rules: `react-architecture` — "`page.tsx` thin, feature in `_components/`, constants in `constants.ts`, strings in i18n"; `next-best-practices` — "async params in `page.tsx` (Next 15)"; `react-best-practices` — "early returns for loading/error/empty; max 200 lines per component"; `react-testing-library` — "assert visible strings (a missing next-intl message only logs)"
- Tests: `ProjectContextView.test.tsx` with mocked hooks. Assert: the footer text and no "chunks"; no Edit/create/upload controls; Used-by popover content and markers; the empty state with patterns; the error state with Retry; a preview where `<script>` is inert and a remote `<img>` is not requested.
- Acceptance: tests pass. The nav entry renders and highlights on `/repos/<id>/context`.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S16 — Agent editor Context tab  [package: client] [depends on: S14, S13]
- AC: AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-54
- Files: modify `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` (add `{key:"context", labelKey:"editor.tabs.context", icon:"FileText"}`; verify the icon name against `@devdigest/ui`), `AgentEditor.tsx` (render the new tab) · create `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/{ContextTab.tsx,ContextTab.test.tsx,index.ts}` · modify `client/messages/en/agents.json`
- Change: uses the picker with `useAgentProjectContext` for the active repository (from `useActiveRepo`). Shows the "X of Y attached" counter. Inherited rows are labelled "via skill <name>", read-only, not toggleable. The footer reads "≈ N tokens per LLM call" with the `## Project context` (direct) and `## Project specifications` (inherited) breakdown, plus the note that both are injected as untrusted blocks. A warning block lists `would_skip` paths. The client does no token math: it renders the server numbers only.
- Skills & rules: `react-architecture` — "colocate in the feature; tab state stays in `?tab=`"; `react-best-practices` — "derive from the query data, never mirror it into state"; `react-testing-library`
- Tests: `ContextTab.test.tsx` — a flow: tick a doc → counter and footer update from the mocked saved state → inherited rows are not toggleable → the over-budget warning names the skipped doc → the no-repo prompt. Also check `AgentEditor.test.tsx` still passes.
- Acceptance: tests pass. A save sends the whole ordered path list.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S17 — Skill editor "Project context to use"  [package: client] [depends on: S14, S13]
- AC: AC-23, AC-24, AC-25, AC-54
- Files: modify `client/src/app/skills/[id]/_components/SkillDetailView/constants.ts` (add the `context` tab), `SkillDetailView.tsx` · create `client/src/app/skills/[id]/_components/SkillDetailView/_components/ContextTab/{ContextTab.tsx,ContextTab.test.tsx,index.ts}` · modify `client/messages/en/skills.json`
- Change: a "Project context to use" section with the picker, an "N attached" counter, the token total, the note "Any agent using this skill inherits these documents.", a "Serializes as" preview (the heading `## Project specifications` plus the attached paths in order), and the over-cap or over-budget warning.
- Skills & rules: same as S16, plus `react-best-practices` — "tab keys stay in `TAB_KEYS`; no inline style objects beyond the existing `styles.ts` convention"
- Tests: `ContextTab.test.tsx` — attach, reorder, the "Serializes as" text, the warning.
- Acceptance: tests pass.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S18 — Run trace drawer  [package: client] [depends on: S2]
- AC: AC-40, AC-41, AC-43, AC-51
- Files: modify `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`, `RunTraceDrawer.test.tsx`, `…/RunTraceDrawer/constants.ts` or `styles.ts` as needed (add colour for the new block) · create `…/RunTraceDrawer/_components/SpecsRead/{SpecsRead.tsx,index.ts}` · modify `client/messages/en/runs.json`
- Change:
  - Prompt assembly: replace the `specs` label with "Project context — attached specs (untrusted)" and add a second `PromptBlock` for `project_specs`, labelled "Project specifications — skill specs (untrusted)". Each shows only when its text is non-null. Opening a block shows the full text, delimiters included.
  - Configuration "Specs read": the `specs_read` paths. Beneath them, skipped records (`project_context` with `status='skipped'`) each show path and reason in a visually distinct style. An empty list still renders "none". An older trace (no `project_context`) renders without errors.
- Skills & rules: `react-architecture` — "feature-private `_components`, strings via i18n"; `react-best-practices`; `react-testing-library` — "the Prompt assembly section starts collapsed: click it first"
- Tests: update `RunTraceDrawer.test.tsx`. A fixture with both sections and one skipped doc asserts both labels, the full text, the skipped row with its reason, and "none" for an older trace fixture.
- Acceptance: tests pass.
- Verify: `cd client && pnpm typecheck && pnpm test`

## AC coverage

| AC / NFR / EC | Step(s) |
|---|---|
| AC-1 | S1, S2, S5, S6, S8, S9, S15 |
| AC-2 | S5, S8 |
| AC-3 | S5, S6, S8 |
| AC-4 | S6, S8 |
| AC-5 | S6, S8 |
| AC-6 | S1, S8, S9, S15 |
| AC-7 | S15 |
| AC-8 | S1, S8, S15 |
| AC-9 | S8, S9, S13, S15 |
| AC-10 | S15 |
| AC-11 | S8, S9, S15 |
| AC-12 | S1, S7, S8, S9, S15 |
| AC-13 | S15 |
| AC-14 | S15 |
| AC-15 | S14, S16 |
| AC-16 | S7, S8, S9, S13, S16 |
| AC-17 | S7, S8, S9, S14, S16 |
| AC-18 | S1, S8, S9, S16 |
| AC-19 | S1, S8, S9, S16 |
| AC-20 | S14, S16 |
| AC-21 | S8, S14, S16 |
| AC-22 | S14, S16 |
| AC-23 | S3, S7, S8, S13, S16, S17 |
| AC-24 | S9, S17 |
| AC-25 | S17 |
| AC-26 | S1, S3, S6, S8, S9, S13 |
| AC-27 | S6, S10, S12 |
| AC-28 | S4, S10, S12 |
| AC-29 | S4, S12 |
| AC-30 | S4, S12 |
| AC-31 | S4, S11, S12 |
| AC-32 | S10, S12 |
| AC-33 | S4, S10, S11, S12 |
| AC-34 | S6, S10, S12 |
| AC-35 | S10, S12 |
| AC-36 | S5, S10, S12 |
| AC-37 | S11, S12 |
| AC-38 | S1, S6, S11, S12 |
| AC-39 | S1, S11, S12 |
| AC-40 | S1, S4, S18 |
| AC-41 | S18 |
| AC-42 | S11, S12 |
| AC-43 | S1, S11, S12, S18 |
| AC-44 | S1, S4, S8, S10, S12 |
| AC-45 | S11, S12 |
| AC-46 | Section 6, manual check |
| AC-47 | S14, S15 |
| AC-48 | S3, S7, S8, S9 |
| AC-49 | S3, S7 |
| AC-50 | S4, S10, S11, S12 |
| AC-51 | S1, S4, S18 |
| AC-52 | S11, S12 |
| AC-53 | S1, S7, S8, S9, S15 |
| AC-54 | S1, S6, S8, S9, S16, S17 |
| NFR-1 | S5, S6, S10 |
| NFR-2 | S8, S10 |
| NFR-3 | S3, S7, S8, S9 |
| NFR-4 | S4, S11 |
| NFR-5 | S8, S10, S12 |
| NFR-6 | S14, S15 |
| NFR-7 | S15, S16, S17, S18 |
| NFR-8 | S4, S11 |
| NFR-9 | S11 |
| EC-1 to EC-23 | via the ACs above. Specific tests: EC-3 (S5, S10), EC-5 (S4, S12), EC-6 (S10), EC-8 (S6, S12), EC-9 (S12), EC-13 (S7, S13), EC-14 (S12), EC-18 (S12), EC-22 (S12) |

Every AC-1..AC-54 is mapped to at least one step. AC-46 is a manual, LLM-dependent check and has no deterministic step by design.

## 5. File inventory
- shared (both copies): `server/src/vendor/shared/{contracts/project-context.ts (create), contracts/trace.ts, contracts/platform.ts, index.ts, adapters.ts}`; `client/src/vendor/shared/{contracts/project-context.ts (create), contracts/trace.ts, contracts/platform.ts, index.ts, adapters.ts if it holds GitClient}`.
- reviewer-core: `src/prompt.ts`, `src/review/run.ts`, `src/index.ts`, `test/prompt.test.ts`, `test/run.test.ts`, `README.md`.
- server:
  - `src/db/schema/context.ts` (or a new `project-context.ts` in that folder + `src/db/schema.ts`), `src/db/migrations/0021_*` and `meta/*` (generated only), `src/db/rows.ts` if needed.
  - `src/adapters/git/simple-git.ts`, `src/adapters/mocks.ts`.
  - `src/modules/project-context/{constants,domain,repository,service,routes}.ts` (create), `src/modules/index.ts`.
  - `src/platform/{config.ts,container.ts,trace-builder.ts}`, `src/modules/reviews/{run-executor.ts,service.ts}`.
  - `docs/{project-context.md (create), intent-layer.md, run-lifecycle-and-cost.md}`, `README.md`.
  - tests: `test/{contracts,config}.test.ts`, `test/project-context-domain.test.ts`, `test/project-context-service.test.ts`, `test/project-context.it.test.ts`, `test/project-context-run.it.test.ts`, `test/git-list-tree.it.test.ts` (all but the first two are create).
- client:
  - `src/lib/hooks/{project-context.ts (create), project-context.test.tsx (create), core.ts, index.ts}`, `src/lib/types.ts`.
  - `src/components/project-context-picker/**` (create), `src/vendor/ui/primitives/Markdown.tsx`, `src/vendor/ui/nav.ts`.
  - `src/app/repos/[repoId]/context/**` (create).
  - `src/app/agents/[id]/_components/AgentEditor/{constants.ts,AgentEditor.tsx,_components/ContextTab/**}`.
  - `src/app/skills/[id]/_components/SkillDetailView/{constants.ts,SkillDetailView.tsx,_components/ContextTab/**}`.
  - `src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/{RunTraceDrawer.test.tsx,_components/TraceBody/TraceBody.tsx,_components/SpecsRead/**}` and constants/styles as needed.
  - `messages/en/{context,agents,skills,runs}.json`.
- Boundary: do not touch `server/clones/**`, `**/node_modules/**`, lockfiles, or an existing migration file.

## 6. Verification (end-to-end)
Per phase, run these before handing the phase back:
- Phase A: `cd server && pnpm db:generate && pnpm db:migrate && pnpm typecheck && pnpm test`; `cd client && pnpm typecheck`; `cd reviewer-core && npm test && npm run typecheck`
- Phase B: `cd server && pnpm typecheck && pnpm test` (hermetic: `pnpm exec vitest run --exclude '**/*.it.test.ts'`; DB-backed: `pnpm exec vitest run .it.test`). `pnpm typecheck` does not cover `server/test/**`, so rely on `vitest`.
- Phase C: `cd server && pnpm typecheck && pnpm test`; `cd reviewer-core && npm test`
- Phase D: `cd client && pnpm typecheck && pnpm test`; then `cd server && pnpm typecheck` (the shared copies stay in sync). Optional safety net: `cd e2e && npm run e2e:hermetic` to confirm the existing flows still pass with the new nav entry.
- Lab end-to-end check (AC-45/AC-46), run by hand with `./scripts/dev.sh`:
  1. In a repo with a clone, commit `docs/architecture.md` containing the invariant "module `api/` must not import `db/` directly" to the default branch, then sync the repo.
  2. Open Project Context for that repo and confirm the doc is listed with a type badge and a token count, and that the footer says "tokens total".
  3. In the agent editor, open Context and tick the doc. Confirm "1 of N attached" and the "≈ N tokens per LLM call" footer.
  4. Open a PR (or create one) whose diff adds `import { db } from '../db'` inside `api/`, and run that agent. The run can start from the UI or through the MCP `run_agent_on_pr`.
  5. In the run trace, open Prompt assembly, then the "Project context — attached specs (untrusted)" block. It must show the doc text with its delimiters and the path. Under Configuration, "Specs read" must list `docs/architecture.md`.
  6. At least one finding should cite the doc path or the invariant. This is the LLM-dependent AC-46 check and is not a gate.
  7. Negative check: rename the doc in the repo and resync. The Context tab marks it "missing". Run again: the run is `done`, the trace shows the doc skipped as `missing`, and the live log has the skip line.

## 7. Risks & open questions
- → user: no e2e flow is planned. The seeded hermetic e2e data has no git clone, so the new page would show only the error state. If you want an e2e flow, say so and it will need a seeded fixture clone (`e2e/README.md` before writing one). The lab check above is manual.
- → user: `ProjectDocumentUser.via` is `'direct'|'skill'` plus a separate `skill_name`, instead of the spec's single `via: 'direct' | <skill name>`. This avoids a clash with a skill actually named "direct". It stays within "exact shapes are the planner's decision".
- → spec-creator: none blocking. One small note: AC-44 says tokens equal for unchanged content. Blobs above 256 KB are not read and use an approximate count, but they are always over the cap and skipped, so the difference is invisible in practice.
- → researcher:
  - Confirm `git ls-tree -r -l -z <sha>` mode and size output format, including the `-` size shown for non-blob entries (S5).
  - Decide whether to add `picomatch` instead of the hand-written glob matcher (S6). The plan assumes no new dependency.
  - If listing 500 docs misses 2 s on a cold clone with `git show` per blob, switch to a single `git cat-file --batch` (S8).
- Insight candidates (do not write; list for the final sweep):
  - Reading docs from git objects at a sha instead of the working tree removes the untracked/symlink/PR-head problems structurally (server).
  - `PromptAssembly` fields with `.default()` force literal updates in every constructor (shared).
  - react-markdown v9 ignores raw HTML but still loads remote images unless `img` is overridden (client).
- Risk: `GitClient.currentHead()` equals the synced default tip only if no one else moves local HEAD. `sync()` is the only mover today (`fetchPullHead` only creates refs). Re-check this in S5.
- Risk: the guard text change in S4 changes every agent's system prompt (not only agents with attachments). If a golden-prompt test exists, update it deliberately. If this is unacceptable, make the guard addition conditional on the sections being present.
- Risk: allowlisted paths exclude non-ASCII file names (same as the Intent Layer rule). Such docs are not listed. Accepted as the stricter rule from NFR-1.
- Risk: `Markdown.tsx` is a vendored UI file. The `blockRemoteImages` prop is additive with default off, so no other caller changes.

## 8. Notes for reviewers
- Architecture:
  - Ring direction in `modules/project-context/`: `domain.ts` imports only shared; `service.ts` takes ports; `repository.ts` is the only Drizzle user; no import from another module's `service.ts` or `repository.ts`.
  - The executor depends on a local port, not on the module.
  - The token parity rule (AC-44): one function `renderProjectDocBlock` in reviewer-core is used by the engine and by the server counts. One function `planProjectContext` backs both the pre-run warning and the run-time skip pass.
  - Known deviations still present and not deepened: the executor imports `db/schema` types; `ReviewService` takes `Container`.
  - Shared copies: the client copy is a targeted port, not a copy of the file.
- Security:
  - Document paths and content are untrusted. Paths pass an allowlist and a membership check against the git tree (no traversal, no absolute, no symlink/submodule, `.md` only) before they are read or saved.
  - Content is read from git objects at the default-branch sha, never the PR head and never the working tree, and arrives only inside `<untrusted>` blocks with the closing delimiter neutralised, under the injection guard.
  - The `source="project-doc:…"` attribute is sanitised in the engine as a second layer.
  - `git ls-tree` and `git show` run with argv and the ref validated as hex. No shell.
  - Logs carry paths, counts, tokens and reasons only, never document text (NFR-2).
  - Every repository query is scoped by `workspaceId`; cross-workspace ids give 404.
  - The client preview renders no raw HTML and blocks remote images; links get `rel="noopener noreferrer"`.
  - No secrets in attachment data.

## Not found
- No curated `server/specs`, `client/specs` or reference design for project-context in git history was checked beyond the plan above (run `git log --all --oneline -- '*project-context*'` at the start of Phase B). The `client/INSIGHTS.md`, `reviewer-core/INSIGHTS.md` and root `INSIGHTS.md` bodies were not read in this planning pass. No existing `server` listing route for `/repos/:id/context` exists (the client hooks point at a route that was never implemented).
- The design artboard "Project Context · empty" could not be read (the spec also says so). The empty-state layout in S15 is based on AC-10 only.