# Plan verification: docs/plans/pr-brief-plan.md (base 9adcc28)

**Produced by:** `plan-verifier` subagent (sonnet), run-plan stage 5, 2026-10-10. Read-only run; the report below is saved as returned, with absolute paths made repo-relative.
**Spec:** `specs/2026-10-10-pr-brief.md` · **Plan:** `docs/plans/pr-brief-plan.md` · **Branch:** `hw-l05-pr-brief`

**Verdict:** NOT VERIFIED, on the Scope-drift rule alone. MET 53 · PARTIAL 0 · NOT MET 0 · UNVERIFIABLE 11.
There is no unmet or partial requirement. Two changed files are neither in the File inventory nor declared as deviations (see Scope drift). If you accept or declare them, the verdict becomes VERIFIED WITH GAPS. The remaining gaps are all manual or process items.

**All P1 ACs MET?** Yes, for every P1 code AC: AC-1, 3, 5, 9, 13, 16, 20, 36, 37, 41, 43, 52, 54. Two P1 rows are not code and are pending: AC-58 and AC-60 (S14, PR contents). AC-52 is MET on the history-entry mechanism. The browser Back check itself is pending (E2E-10).

Step rows are one per step. Each folds in that step's files[i], change[j], tests[k], acceptance and verify, all of which were checked individually.

## Traceability matrix

Commits: C1 = 7b8fa67 (S1), C2 = c3ed621 (S2–S7), C3 = 74b5c0e (S8–S13), C4 = 4db5b6a (test additions). Paths are shortened. `srv` = `server/test/`. `cli` = `client/src/…/pulls/[number]`.

| ID | Item | Step | Test | Commit | Method | Status | Evidence |
|---|---|---|---|---|---|---|---|
| AC-1 | Overview shows PR Brief block, Generate or stored brief | S10, S11 | `OverviewTab.test.tsx` "exactly one 'Generate brief'…"; BriefCard "offers Generate…" | C3 | test+insp | MET | `OverviewTab.tsx` adds `<BriefCard prId onOpenFile/>` in a first section; client suite 169/169 PASS |
| AC-3 | Generate only on user trigger | S5–S8, S10 | `brief-service` "one model call per generate, none on get"; `brief.it` "GET before any generation… zero model calls"; `brief.test.tsx` AC-43 | C2, C3, C4 | test | MET | `routes.ts` GET→`briefService.get`; hooks `enabled:!!prId`, POST only via mutate; PASS |
| AC-4 | Skeleton and disabled actions while unresolved or in flight | S8, S10 | BriefCard "…disabled action while generating"; "never an endless skeleton once prId resolves" | C3 | test+insp | MET | `BriefCard.tsx:~29` `if (!prId \|\| isLoading \|\| generate.isPending)` → Skeleton with a disabled Button |
| AC-5 | Summary, Risk, Focus shown after generation | S10 | BriefCard "…then renders the brief"; `brief.test.tsx` AC-5/8 | C3, C4 | test | MET | `onSuccess` `setQueryData({brief, stale:false})`; PASS |
| AC-8 | Error with retry; stored brief stays | S8, S10 | BriefCard "keeps a stored brief visible with an inline retry…"; `brief.test.tsx` AC-5/AC-8 | C3, C4 | test | MET | `BriefCard.tsx` inline `role="alert"` plus `t("brief.retry")`; ErrorState only when `!brief` |
| AC-9 | Exactly one "Generate brief"; Intent relabelled "Derive intent" | S9, S11 | `OverviewTab.test.tsx`; `IntentCard.test.tsx:89` | C3 | test | MET | `brief.json` diff: `intent.generate` → "Derive intent"; PASS |
| AC-10 | All strings from the `brief` namespace | S9, S10 | BriefCard tests assert visible strings | C3 | insp+test | MET | `brief.json` JSON parses (exit 0). A grep of new strings shows `t("brief.*")` only |
| AC-13 | Plain text, severity text, `file:line — reason` in model order | S10 | BriefCard "deep-links from risk files… renders model text literally" | C3 | test+insp | MET | `grep dangerouslySetInnerHTML` in BriefCard → none; severity keys High/Medium/Low |
| AC-16 | Empty, removed and missing-facts notes | S9, S10 | BriefCard "marks a stale brief… notes empty/removed content" | C3 | test+insp | MET | `RiskList.tsx:21` `noRisks`; `FocusList.tsx:18` `focusEmpty`; `BriefCard.tsx` `removedNote` and `generatedWithout` (includes `fact.noSpecs`) |
| AC-20 | Missing or degraded facts still generate, status recorded | S2, S5 | `brief-service` "degrades the facts but still generates…", "stale intent, unavailable blast…"; `brief-domain` deriveFacts ×3 | C2 | test | MET | `service.ts` isolates intent, blast, github and specs in try/catch; `deriveFacts`; PASS |
| AC-22 | Specs from the brief agent plus enabled skills; agent and paths recorded | S3, S4, S5 | `brief.repository.it` "latestRunAgent…", "enabledSkills honours both flags"; `brief-service` "no agent" | C2 | test | MET | `service.ts`: `specDocs=[...contextDocs,...specsDocs]`; facts record agent and paths. IT executed (see Commands) |
| AC-26 | Exactly one structured call | S5, S7 | `brief-service` first test; `brief.it` "POST makes exactly one model call…" | C2 | test | MET | one `completeStructured` in `service.ts`; PASS |
| AC-27 | `risk_brief` provider and model, recorded | S2, S5, S7 | `brief.it` "…with the configured model" | C2 | test | MET | `container.ts` `resolveFeatureModel(this, ws, 'risk_brief')`; record carries provider and model; PASS |
| AC-28 | No diff body line or file content in the input | S3 | `brief-input` "lists paths, stats and changed ranges (the input type has no patch body)"; `brief-service` "…no diff body" | C2 | test+insp | MET | `input.ts` file entry is `{path,additions,deletions,role,ranges}`; `formatRanges` only |
| AC-30 | First-sent input ≤ 8000, shares and reduction order recorded | S3 | `brief-input` "respects the shares and reduces in order specs → files → description, total ≤ budget"; "reduces only as far as needed" | C2 | test | MET | `constants.ts` budget 8000 and shares 600/1500/2000/1500/2400; order `['specs','diff_stats','description']`; PASS. Real-LLM count: see E2E-7 |
| AC-34 | Budget overflow: error, no call, brief unchanged | S3, S5 | `brief-input` "fails with a budget error…"; `brief-service` "a budget failure makes zero model calls… (422)" | C2 | test | MET | `AppError('brief_budget_exceeded',…,422)` raised before the LLM call |
| AC-35 | Untrusted blocks, guard text, case-insensitive sanitiser | S3 | `brief-input` "keeps injection strings, </UNTRUSTED> and newline paths inside their blocks" | C2 | test+insp | MET | `input.ts:66-72` `sanitizeUntrusted` / `sanitizeInline`; `wrapUntrusted` / `renderProjectDocBlock` |
| AC-36 | Validate output, fail leaves brief unchanged | S1, S3, S5, S7 | `contracts.test` "BriefModelOutput accepts valid & enforces limits"; `brief-service` "invalid model output leaves stored brief unchanged… 502… logs once"; `brief.it` "…invalid output is a 502 that keeps the old brief" | C1, C2 | test | MET | `schema: BriefModelOutput` passed to `completeStructured`; the failure is wrapped as `ExternalServiceError`; PASS |
| AC-37 | Grounding: drop refs, drop focus, snap lines, counts | S2, S5 | `brief-domain` groundBrief ×5 (invented/`path:12`/absolute, multi-ref, snap with tie to earlier, patch-less→caller, all-ungrounded, order) | C2 | test | MET | `service.ts` calls `groundBrief(result.data,{changed: ranges (full), callers (all)})`; PASS |
| AC-41 | Contracts in both copies, identical | S1 | `contracts.test` BriefModelOutput | C1 | demo | MET | `diff server/…/brief.ts client/…/brief.ts` → no output, exit 0; both files in `git diff --name-status` |
| AC-42 | Replace stored brief with head SHA, time, facts, reductions, usage | S1, S4, S5, S7 | `brief.repository.it` "save then getStored round-trips, upsert replaces…"; `brief-service` first test (EC-20 SHA); `brief.it` | C1, C2 | test | MET | `repository.ts:70` `onConflictDoUpdate({target: prBrief.prId,…})`; record built with `head_sha: headSha` read at start |
| AC-43 | Reload shows the brief with stale flag, no generate, intent or blast | S4–S8 | `brief.it` "POST…; GET reads it back without a call"; `brief.test.tsx` AC-43 | C2, C4 | test | MET | `BriefService.get` calls only `loadPull` and `getStored` |
| AC-45 | Refresh offered, "Outdated" text, no auto-regenerate | S2, S7, S9, S10 | BriefCard "marks a stale brief Outdated, refresh regenerates"; `brief-domain` isStale; `brief.it` "flips stale when the head moves" | C2, C3 | test | MET | `BriefCard.tsx` Badge `t("brief.outdated")`, Refresh Button; `isStale` returns false for an unknown head |
| AC-46 | 422 on no files, 429 over 10/min, no model call | S4–S7 | `brief-routes.test` "rate limits POST at 10/min without an extra service call, GET unlimited"; `brief.it` "no pr_files is a 422 with no model call"; `brief-service` "no changed files → ValidationError" | C2 | test | MET | `routes.ts` `config:{rateLimit: BRIEF_RATE_LIMIT}` (10, 1 minute); 11th POST → 429 asserted |
| AC-49 | Missing or cross-workspace PR → 404 | S4–S7 | `brief.it` "…cross-workspace PR is a 404"; `brief.repository.it` loadPull and getStored undefined across workspaces | C2 | test | MET | `service.ts` `NotFoundError`; repository queries are filtered by `workspaceId` |
| AC-51 | One content-free log line per generation; usage stored | S1, S5, S6, S7 | `brief-service` "invalid output… still logs once", "duration_ms_non_model excludes the model call time" | C1, C2 | test+insp | MET | `service.ts` `finally{ opts.onFinish?.(line) }`; `routes.ts` `req.log.info(line,'brief: generated')`; `BriefLogLine` has ids, counts, tokens and cost only. A real-server line count is pending (E2E-6) |
| AC-52 | Click opens the file expanded (including a collapsed group), scroll and highlight, history entry | S10, S12, S13 | `DiffTab.test` "deep link: expands a default-collapsed group, shows the target line and scrolls"; "…without a rendered line… header"; `page.test` "opening a file from the brief pushes a history entry…"; BriefCard deep-link test | C3, C4 | test+insp | MET | `page.tsx` `openFile`→`navigate(sp,"push")`; `SmartDiffGroups` deletes the target's role from the collapsed set; `FileCard` `scrollIntoView`; `CodeLine` `data-new-line`. Browser Back is pending (E2E-10) |
| AC-54 | Not-in-diff message naming the file | S9, S12, S13 | `DiffTab.test` "deep link: an unknown file shows the not-in-diff note naming it and still renders the diff"; `helpers.test` parseDiffTarget ×3 | C3 | test | MET | `DiffTab.tsx` `target && !inDiff` → `tBrief("brief.notInDiff",{file})`; `inDiff` compares `files.some(f=>f.path===target.file)` |
| AC-58 | Spec and plan committed before feature code | S14 | — | 9adcc28 | analysis | UNVERIFIABLE | `git log --oneline`: 9adcc28 "docs(pr-brief): spec, plan and cross-model review" precedes 7b8fa67, so the order holds. The PR-contents check is a main-session process step (S14), pending |
| AC-60 | PR description, demo, cross-model note, verifier report | S14 | — | — | — | UNVERIFIABLE | PR contents do not exist yet. This report plus `docs/plans/pr-brief-verification.md` and the demo are still to be added |
| NFR-1 | Untrusted input, model output untrusted | S3, S5, S10, S12 | brief-input injection test; domain grounding; BriefCard literal-render test | C2, C3 | test | MET | see AC-35, AC-37, AC-13; `parseDiffTarget` plus `files.some` compares only, never fetches |
| NFR-2 | Logs content-free, no secrets | S5, S6 | `brief-service` log tests | C2 | insp | MET | `BriefLogLine` fields; the ExternalServiceError message wraps only the provider text |
| NFR-3 | Workspace tenancy | S4, S7 | `brief.repository.it`, `brief.it` cross-workspace cases | C2 | test | MET | `repository.ts:24,29,54,65,86-89,108` workspace predicates |
| NFR-4 | One call, ≤ 8000 in, 1500 out, rate limit | S3, S5, S6 | see AC-26/30/46 | C2 | test | MET | `BRIEF_MAX_TOKENS=1500` passed as `maxTokens` |
| NFR-5 | Read p95 ≤ 300 ms, non-model ≤ 3 s | S5 | `brief-service` fake-clock test (field logic only) | C2 | — | UNVERIFIABLE | The timing field is tested. The real GET p95 and the non-model duration need the dev stack: 20× curl on `GET /pulls/:id/brief`, and read `duration_ms_non_model` from a POST log line |
| NFR-6 | Accessibility | S10 | BriefCard tests | C3 | insp+test | MET | `aria-live="polite"` wrapper; file refs and focus rows are `<button>`s; severity has a text label; Outdated is text |
| NFR-7 | i18n, no duplicate top-level keys | S9, S10 | JSON.parse check | C3 | demo | MET | `brief.json` parses (exit 0); the diff adds only a nested `brief` group |
| NFR-8 | Compatibility | S11, S12 | DiffTab "without a target nothing scrolls and no note is shown"; existing DiffTab and diff-viewer tests | C3 | test | MET | Client suite 47 files / 169 tests PASS |
| S1 | Shared contracts, both copies, contracts test | S1 | `contracts.test` BriefModelOutput | C1 | insp+test | MET | both copies `M` in name-status; byte-identical; PASS |
| S2 | Constants and domain, brief-domain test | S2 | `brief-domain.test.ts` (11 tests) | C2 | test | MET | constants match the plan (`BRIEF_RATE_LIMIT` etc.); PASS |
| S3 | `input.ts`, `prompt.ts`, brief-input test | S3 | `brief-input.test.ts` (6) | C2 | test | MET | A `prompt.ts` + `input.ts` + test exist; PASS |
| S4 | `repository.ts`, repository IT | S4 | `brief.repository.it.test.ts` (5) | C2 | test | MET | Executed against Docker (3.1 s), not skipped; PASS |
| S5 | `service.ts`, service test | S5 | `brief-service.test.ts` (9) | C2 | test | MET | narrow ports; no drizzle or fastify import; `classifyFile` imported (declared deviation); PASS |
| S6 | `routes.ts`, `modules/index.ts`, `container.ts` | S6 | indirect via S7 | C2 | insp | MET | the `modules/index.ts` diff is one import plus one entry `brief`; the container getters match the plan. `routes-smoke.test.ts` not changed (does not enumerate routes) |
| S7 | `brief.it` and `brief-routes` tests | S7 | `brief.it.test.ts` (4), `brief-routes.test.ts` (2) | C2 | test | MET | IT executed (3.2 s); all cases from the plan present; no 429 case in the IT, as the plan says; PASS |
| S8 | `lib/hooks/brief.ts` | S8 | `brief.test.tsx` | C3, C4 | insp+test | MET | `usePrBrief` `enabled:!!prId`; `useGenerateBrief` writes only in `onSuccess`; not added to the barrel |
| S9 | `brief.json` keys, IntentCard label | S9 | `IntentCard.test.tsx` | C3 | test | MET | see AC-9/10 |
| S10 | BriefCard plus RiskList and FocusList | S10 | `BriefCard.test.tsx` (5) | C3 | test | MET | all files in the diff; all plan cases covered; `BriefCard.tsx` is 123 lines |
| S11 | OverviewTab wiring | S11 | `OverviewTab.test.tsx` | C3 | test | MET | new first section with `t("intent.briefLabel")`, Intent label → `block.intent`; the `onOpenFile` prop |
| S12 | Deep link: DiffTab, SmartDiffGroups, diff-viewer, helpers | S12 | `DiffTab.test.tsx` (4 new), `helpers.test.ts` (3 new) | C3 | test | MET | `parseDiffTarget`, `key` re-mount, `FileCard` mount effect, `CodeLine` `data-new-line` + highlight, `DiffTarget` exported |
| S13 | `page.tsx` push navigation | S13 | `page.test.tsx` (3, added in C4) | C3, C4 | test | MET | `setTab` clears file and line; `openFile` pushes; `parseDiffTarget(search)` passed as `target` |
| S14 | Process deliverables | S14 | — | — | — | UNVERIFIABLE | Main-session step, pending (see AC-58 and AC-60) |
| INV | File inventory | — | — | — | analysis | MET | Every inventory file is in `git diff --name-status` (A or M), including both vendored contracts, 7 server module files, `index.ts`, `container.ts`, `contracts.test`, 6 server tests, and the client hooks, `brief.json`, BriefCard tree, OverviewTab, IntentCard test, DiffTab files, SmartDiffGroups, diff-viewer files and `page.tsx`. `routes-smoke.test.ts` was conditional and is not touched. Scope drift is listed below |
| SCOPE.out | Out of scope stays untrue | — | — | — | analysis | MET | The diff touches no `db/**`, no migration, no `app.ts`, no `reviewer-core/**`, no `adapters/llm/**`, no `e2e/**`, no lockfiles. It adds no queue, VerdictBanner, expandable risk, COST change or `doc-writer` output |
| E2E-1 | Contracts diff | — | — | — | demo | MET | `diff` → exit 0 |
| E2E-2 | Server typecheck and vitest (hermetic + IT) | — | — | — | demo | MET | see Commands |
| E2E-3 | Client typecheck and test | — | — | — | demo | MET | see Commands |
| E2E-4 | `cd client && pnpm build` | — | — | — | — | UNVERIFIABLE | Not in the allowed command set (INSIGHTS: plan-verifier cannot run build). Run `cd client && pnpm build` |
| E2E-5 | Dev-stack demo walk (generate, reload, focus click, risk click, blast-only file, head_sha → Outdated) | — | — | — | — | UNVERIFIABLE | Needs `./scripts/dev.sh` and a real LLM (pending manual) |
| E2E-6 | Single real `brief: generated` log line per POST, no text | — | — | — | — | UNVERIFIABLE | Pending manual (real LLM). The service-level once-only is tested |
| E2E-7 | Real-LLM input ≤ 8000 tokens | — | — | — | — | UNVERIFIABLE | Pending manual. The fake-tokenizer tests pass |
| E2E-8 | GET p95 ≤ 300 ms | — | — | — | — | UNVERIFIABLE | Pending manual (20× curl) |
| E2E-9 | `duration_ms_non_model` ≤ 3000 ms on an indexed repo | — | — | — | — | UNVERIFIABLE | Pending manual (read from a POST log line) |
| E2E-10 | Browser Back from Files changed returns to Overview | — | `page.test` asserts push | C4 | — | UNVERIFIABLE | Pending manual. `router.push` is asserted, but browser Back behaviour is not tested |

EC-1…EC-32 were checked through the AC rows and the step tests above. Edge cases by area:
- Facts: EC-1–7 via `brief-service` and `brief-domain` deriveFacts.
- Budget: EC-8–10, EC-31 via `brief-input` and `brief-service`.
- Grounding: EC-11–15 via `brief-domain`.
- Provider errors: EC-16–18 via `brief-service` and `brief-input`.
- Staleness and head SHA: EC-19, EC-20, EC-24, EC-25 via `brief.it` and `brief-service`.
- Rejected requests: EC-22, EC-23, EC-30 via `brief-routes`, `brief.it` and `brief-service`.
- Client: EC-26–EC-29 and EC-32 via `DiffTab.test` and BriefCard tests.
- EC-21: last write wins (`onConflictDoUpdate`); the action is disabled while in flight.

## Commands run
- `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` — exit 0, no output
- `cd server && pnpm typecheck` — exit 0
- `cd server && pnpm exec vitest run test/contracts.test.ts test/brief-domain.test.ts test/brief-input.test.ts test/brief-service.test.ts test/brief-routes.test.ts test/brief.repository.it.test.ts test/brief.it.test.ts` — 7 files, 53 tests passed. **The two `*.it.test.ts` files executed against Docker (repository 5 tests in about 3.1 s, brief.it 4 tests in about 3.2 s) and did not self-skip.**
- `cd server && pnpm test` (full suite, includes all `*.it` files) — 55 files, 444 tests passed
- `cd client && pnpm typecheck` — exit 0
- `cd client && pnpm test` — 47 files, 169 tests passed
- `node -e JSON.parse(messages/en/brief.json)` — exit 0
- `git status --short` is identical before and after the run (only the staged `.gitignore`).

## Scope drift
- `server/INSIGHTS.md` — modified (added the "`wrapUntrusted` escapes only the exact lowercase `</untrusted>`" entry). It is not in the inventory and not a declared deviation. The plan listed this candidate insight as "not written by me".
- `client/src/components/diff-viewer/helpers.ts` — modified (`DiffTarget` interface added). The inventory lists only `index.ts` for that export, and this file is not a declared deviation.
- Declared and therefore not drift: `DiffTab/styles.ts` (`notInDiff`), `OverviewTab.test.tsx`, the `FileCard` eslint-disable, `DiffTab/index.ts` (A1), `page.test.tsx` and `lib/hooks/brief.test.tsx` (test-writer), `BriefRiskOut` vs `BriefRisk`, `classifyFile` import and `workspaceId` scoping in `latestRunAgent`.
- `DiffTab.test.tsx` and `helpers.test.ts` already existed and were modified. The plan said "create" for `DiffTab.test.tsx`, which is cosmetic.

## Unclosed rows before merge
- AC-58 and AC-60 (and S14) — pending process deliverables (PR description, demo, cross-model note, final verifier report).
- NFR-5, E2E-6, E2E-7, E2E-8, E2E-9, E2E-10 and E2E-5 — pending manual checks.
- E2E-4 — `pnpm build` was not run.
- Scope drift — `server/INSIGHTS.md` and `client/src/components/diff-viewer/helpers.ts` need to be declared as deviations (or reverted) to lift NOT VERIFIED.

## What would close the gaps
- Scope drift — declare both files as deviations. Both look benign: an INSIGHTS entry and a type definition re-exported from `index.ts`.
- AC-58 and AC-60 — add the PR description, demo video, `docs/plans/pr-brief-plan-crossreview.md` and `docs/plans/pr-brief-verification.md`. Keep the docs commit before the `feat` commits (already true).
- NFR-5, E2E-5 to E2E-9 — on `./scripts/dev.sh` with a real LLM key: generate once, count `brief: generated` lines (expect 1), check input tokens ≤ 8000, run the 20× curl p95 (≤ 0.3 s), read `duration_ms_non_model` (≤ 3000 ms), then change `pull_requests.head_sha` and expect Outdated.
- E2E-10 — in a browser, click a focus item, then Back, and expect Overview.
- E2E-4 — run `cd client && pnpm build`.

## Not found
Everything referenced was found. The plan section 3 name `BriefRisk` exists as `BriefRiskOut` (declared). The plan section 7 researcher questions (strict JSON-schema bounds, Anthropic token summing across repairs) were not verifiable from the tree.

---

## Main-session note (run-plan orchestrator)

Not part of the verifier's output. The two scope-drift files were reported by the implementers but were not passed to the verifier as deviations:
- `server/INSIGHTS.md` — listed under "Insights recorded" in the Phase 2 (S2–S7) implementer report (commit c3ed621).
- `client/src/components/diff-viewer/helpers.ts` — listed in the S12 changed files of the Phase 3 (S8–S13) implementer report (commit 74b5c0e).

Neither change is a code fix, and the verdict above has not been re-run.
