# Development Plan: L04 Blast Radius (server route, Overview block, MCP tool)

## Context
Homework `tasks/l04-blast-radius/homework.md` asks for the Blast Radius feature. A reviewer should see what else a PR may break: the changed symbols, their callers as `file:line`, and the HTTP endpoints and crons those callers reach. The data already exists in the repo-intel index (`repoIntel.getBlastRadius`). The feature only reads it: no LLM call, no re-parse. There are three deliverables:
- a server route `GET /pulls/:id/blast`
- a Blast radius block on the PR Overview tab
- a real `get_blast_radius` MCP tool that replaces the stub

P1 criteria block submission. P2 is cheap and included. P3 is partially included.

On approval, save this plan to `docs/plans/blast-radius-plan.md` (user convention). Run one implementer subagent per phase, in order. Then run architecture-reviewer ∥ plan-verifier.

### Applied INSIGHTS (short)
- **root**
  - Course features were reverted, and there is no blast reference implementation in history.
  - plan-verifier can't run `pnpm build`, so the implementer quotes it.
- **server**
  - The two shared copies have drifted: port only the targeted diff and `diff -rq` before and after (the same 6 files should differ).
  - `pnpm typecheck` skips `test/**`, so also run vitest.
  - No `*/` inside JSDoc.
- **client**
  - A disabled TanStack Query keeps `isPending` true forever, so gate on `!prId || isLoading`.
  - next-intl doesn't throw on missing keys, so tests assert the real strings.
  - No duplicate top-level JSON keys.
  - Icon buttons need `aria-label`.
  - Use a module-level `EMPTY` constant for memo fallbacks.
- **mcp**
  - The fake needs method-scoped `*FailWith` flags.
  - Use `.array()` on shared schemas.
  - Register through `_register.ts#registerTool`.
  - Tool-specific hints go only in `EXTRA_HINTS`.
  - The flag-off `tools/list` budget is ≤7000.

### Discrepancies vs. homework text (verified in code)
- The facade never emits `index_partial` or `flag_off` today; it returns `no_data`, or `degraded:false` for a partial index. **S2 fixes this.**
- `BFS_DEPTH` is not used by `getBlastRadius`, which is one hop. `MAX_CALLERS_PER_SYMBOL` is applied **globally**, not per symbol, in the persistent path. The per-symbol cap is applied in the mapping (S3). The facade traversal is left as is.
- On the fallback path, `factsByFile` is absent, so per-symbol endpoints are empty. The degraded badge explains this.
- `pr_files` rows are only populated by `GET /pulls/:id`. MCP on a never-opened PR returns an empty map, and the tool adds a hint for that case.

---

## Phase 1: Contract + server

**S1: Contract (both shared copies).** In `server/src/vendor/shared/contracts/review-api.ts` and the identical client copy:
- add `BlastDegradedReason = z.enum(['flag_off','index_failed','index_partial','repo_too_large','no_data'])`
- add `BlastRadiusResponse = BlastRadius.extend({ degraded: z.boolean(), reason: BlastDegradedReason.nullable() })` plus the types
- leave `BlastRadius` in `brief.ts` untouched

Verify: typecheck both packages; `diff -rq` shows the same 6 drifted files.

**S2: Honest facade degradation.** In `server/src/modules/repo-intel/service.ts#getBlastRadius` / `tryPersistentBlast`:
- partial index → `degraded:true, reason:'index_partial'` (both returns)
- fallback reason is `flag_off` when `!repoIntelEnabled`, `index_failed` when the state is failed, otherwise `state?.degradedReason ?? 'no_data'`
- read the state once and pass it through
- add a private pure helper `fallbackBlastReason`

Tests: extend `server/test/repo-intel-facade-degraded.test.ts` with flag-off and partial cases.

**S3: Pure mapping.** `server/src/modules/blast/domain.ts` exports `toBlastRadius(result, maxCallersPerSymbol = MAX_CALLERS_PER_SYMBOL)`. It builds the response in these steps:
1. `changed_symbols` = the facade's changed symbols.
2. Drop callers located in the symbol's declaring file (defensive guard).
3. Group callers by `viaSymbol`. In each group, dedupe on `file|line|symbol`, sort by rank desc / file / line, cap at `maxCallersPerSymbol`, and map to `{name,file,line}`.
4. Per group, endpoints and crons are sorted unique unions from `factsByFile` over that group's caller files. Both are `[]` if `factsByFile` is absent.
5. Order groups by max rank.
6. `summary` comes from `summarizeBlast` (deterministic string).
7. Pass through `degraded`/`reason`.

Also export `countBlast`.

Tests: `server/test/blast-domain.test.ts` covers grouping, per-group endpoints and crons (separate), declaring-file exclusion, the cap, ordering, no `factsByFile`, the empty case, degraded passthrough, and a `safeParse` check. There must be no hardcoded 20.

**S4: Service + repository.**
- `blast/service.ts`:
  - `BlastSourcePort.loadScope(workspaceId, prId) → {repoId, changedFiles} | undefined`
  - `BlastService({source, repoIntel: Pick<RepoIntel,'getBlastRadius'>}).build()`: throws `NotFoundError` if the PR is unknown; otherwise calls the facade **once** and maps the result
- `blast/repository.ts`: Drizzle, workspace-scoped PR lookup, and `pr_files.path` (modeled on `SmartDiffRepository.loadInputs`)

Tests: `server/test/blast-service.test.ts` checks the 404 path (facade not called) and that the facade is called once with the right args.

**S5: Route + wiring.**
- `blast/routes.ts`: `GET /pulls/:id/blast` with `params: IdParams` and `response: {200: BlastRadiusResponse}`. It calls `getContext` → `blastService.build` and logs `blast: built {counts, degraded, reason, source, llm:false}` (P2 evidence).
- `platform/container.ts`: lazy `blastRepo` / `blastService` getters using `this.repoIntel`.
- `modules/index.ts`: register the route.

Tests: `server/test/blast.it.test.ts` (testcontainers, fake `repoIntel` override) covers 200 + safeParse + a single facade call with the seeded files, 404 for an unknown uuid, and 422 for a non-uuid.

**S6: Docs.** Add the route to the `server/README.md` API map.

Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run test/blast.it.test.ts`

## Phase 2: Client

**S7: Hook.** `client/src/lib/hooks/blast.ts` exports `blastKey(prId)` and `usePrBlast(prId)` → `api.get<BlastRadiusResponse>('/pulls/${prId}/blast')`, `enabled: !!prId`. It is not added to the barrel.

**S8: i18n.** In `client/messages/en/blast.json`, add `loadError`, `endpoints`, `crons`, `degraded.label`, and `degraded.reason.{flag_off,index_failed,index_partial,repo_too_large,no_data}`. Keep the existing keys.

**S9: `BlastRadiusCard`.** Create it under `pulls/[number]/_components/BlastRadiusCard/`, with nested `_components/{BlastStats,SymbolImpact,DegradedBadge}`, plus `helpers.ts#blastStats` and `styles.ts`.
- States: Skeleton, ErrorState with retry, DegradedBadge, BlastStats, then either `noDownstream` text or a list of `SymbolImpact`.
- Each caller is a `MonoLink` to `githubBlobUrl(repoFullName, headSha, file, line)` plus ` · callerName`.
- Endpoint chips (info color) and cron chips (warn color) sit in separate labelled groups.

Tests: `BlastRadiusCard.test.tsx` covers the happy path (stats, link href, endpoint and cron groups), the empty state, and the degraded state.

**S10: Mount.**
- `OverviewTab` gains the props `repoId`, `repoFullName`, `headSha` and renders a section titled with `brief.block.blast` → `BlastRadiusCard`.
- `page.tsx` passes `activeRepo?.full_name` and `pr.head_sha`.

**S11: Docs.** Add a `pr-blast` line to `client/docs/data-flow.md`.

Verify: `cd client && pnpm typecheck && pnpm test && pnpm build` (the implementer quotes the build output).

## Phase 3: MCP `get_blast_radius`

**S12: Port and adapter.**
- `mcp/src/api/port.ts` + `http.ts`: add `listPulls(repoId)` (`GET /repos/:id/pulls`, `PrMeta.array()`) and `getBlastRadius(prId)` (`GET /pulls/:id/blast`).
- `mcp/test/fakes.ts`: fake data, a `blastCalls` array, and method-scoped `FailWith` flags.

Test: a 404 test in `http.test.ts`.

**S13: Formatter.** A pure `mcp/src/format/blast.ts#formatBlast` returns a compact flat shape: `{repo, prNumber, summary, degraded, reason, changedSymbols[], downstream[{symbol, callers["file:line name"], endpoints, crons}], hint?}`.
- The degraded hint suggests a resync.
- With zero symbols, the hint says to open the PR in DevDigest once.

Tests go in `format.test.ts`.

**S14: Real tool.** In `mcp/src/tools/get-blast-radius.ts`:
- Keep the input `{repo, prNumber}` and add a flat `OutputSchema`.
- Description ≤300 chars. Annotations: `readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:false`.
- Handler: `resolveRepo` → `listPulls` → find the PR by number.
  - Not found: `errorResult("PR #N is not in DevDigest for owner/name", hint)`.
  - Found: `getBlastRadius` → `untrustedResult(formatBlast(...))`.
  - `ApiError` → `apiErrorResult` with `EXTRA_HINTS`.
- **Tool exposure (user decision): always on.**
  - Remove `enableBlastRadius` / `DEVDIGEST_MCP_ENABLE_BLAST_RADIUS` from `mcp/src/config.ts`.
  - Register the tool unconditionally in `mcp/src/server.ts` (still last).
  - Measure the new `tools/list` size and raise `MAX_TOOLS_LIST_CHARS` in `tools-list.test.ts` to the measured value plus a small margin (~8000).
  - Record the number in the README and in a `mcp/INSIGHTS.md` entry.
  - `.mcp.json` is unchanged.

Tests: `tools.test.ts` covers the happy path, an unknown PR, an unknown repo, and 404 hints. In `tools-list.test.ts`, replace the stub test and keep the budget assertion.

**S15: Docs.** Update the `mcp/README.md` tools table, env var, errors, and the measured `tools/list` size. Update the `docs/plans/mcp-server-test-guide.md` rows.

Verify: `cd mcp && npm run typecheck && npm test`

## Phase 4: P3 polish (client)

**S16: Collapsible tree.** `SymbolImpact` gets a header button with `aria-expanded`/`aria-label` (i18n key `toggle`), local `useState(true)`, and a tree-guide border. Test: toggle hides and shows the callers.

**S17: Resync button.**
- `DegradedBadge` gets `onResync`/`resyncing` props and a Button with the keys `resync`, `resyncing`, `resyncStarted`.
- The card uses the existing `useResyncRepoIntel(repoId)` from `@/lib/hooks/repo-intel` and invalidates `blastKey(prId)` on success.

Test: clicking the button calls `mutate`.

Already done in earlier phases: crons shown separately (S9), sorting by rank (S3), and i18n from `blast.json` (S8/S9).

## Phase 5: Graph view + Tree/Graph toggle (client, P3)

**S18: Pure layout helper.** `BlastRadiusCard/_components/BlastGraph/helpers.ts#layoutBlastGraph(blast)` returns `{nodes[{id, kind: symbol|caller|endpoint|cron, label, x, y}], edges[{from,to}]}` using a deterministic column layout:
- column 1: changed symbols
- column 2: callers
- column 3: endpoints and crons, deduped

There is no new dependency.

Tests: hermetic unit tests for node and edge counts and dedupe.

**S19: `BlastGraph` component.**
- Inline SVG with rounded nodes colored by kind (CSS vars), straight or curved edges, and an `aria-label` from `graph.ariaLabel`. It shows `graph.empty` when there is no downstream.
- Caller nodes are `<a>` elements to `githubBlobUrl`.
- Keep the SVG within the card width, with horizontal scroll inside the card only.

**S20: Toggle.**
- `BlastRadiusCard` has local `view` state (`'tree' | 'graph'`) and a segmented control labelled `view.tree` / `view.graph` in the card header, per the screenshot.
- It renders the list or `BlastGraph`.
- Stats and the degraded badge are shared by both views.

Test: toggle switches views, and the graph renders the caller links.

Verify: `cd client && pnpm typecheck && pnpm test && pnpm build`

## Decisions (user)
- The MCP tool is always on; the flag is removed.
- P3 scope: collapsible tree, resync button, and graph view.
- Caller links use the PR's `head_sha`.

## Out of scope
- Prior PRs (needs GitHub data).
- e2e flows.
- Indexer changes.
- The demo video and the PR description (user tasks).

## Verification (end-to-end, matches the video script)
1. Run `./scripts/dev.sh`. Import the dev-digest fork, and open a PR that changes an exported function in `server/src/modules/reviews/helpers.ts`.
2. `curl -s localhost:3001/repos/<repoId>/index-state | jq .status` → `"full"`.
3. Go to Overview → Blast radius. Check the stats row, ≥2 callers `file:line`, and ≥1 endpoint chip. Clicking a caller opens `github.com/.../blob/<head_sha>/<file>#L<line>`.
4. `curl -s localhost:3001/pulls/<prId>/blast | jq '{summary,degraded,reason}'`. The server log shows `blast: built … llm:false source:"index"`, with no indexing jobs.
5. Empty state: a docs-only PR → the `noDownstream` text. Degraded state: an unindexed repo or `REPO_INTEL_ENABLED=false` → the badge with its reason (and the resync button after Phase 4).
6. In Claude Code: "blast radius for owner/dev-digest #N" → `get_blast_radius` output matches the UI.

Also run:
- `diff -rq server/src/vendor/shared client/src/vendor/shared` (the same 6 files; `review-api.ts` absent)
- the onion checklist greps

Risk to check early: if `references.decl_file` isn't resolved for `.js` → `.ts` imports, callers will be 0 even on a full index. That is an indexer issue.
