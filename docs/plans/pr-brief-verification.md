# Plan verification: PR Brief (Why + Risk)

- **Plan:** `docs/plans/pr-brief-plan.md` (approved)
- **Spec:** `specs/2026-10-10-pr-brief.md` (approved)
- **Base:** `9adcc28` (docs-only), branch `hw-l05-pr-brief`
- **Verifier:** `plan-verifier` subagent (sonnet), read-only, run 2026-10-10 after implementer (3 phases), architecture-reviewer and test-writer
- **Commits verified:**
  - C1 = `7b8fa67` feat(shared): brief contracts (S1)
  - C2 = `c3ed621` feat(server): brief module (S2–S7)
  - C3 = `74b5c0e` feat(client): BriefCard, deep link, page navigation (S8–S13; includes architecture finding A1 fix)
  - C4 = `4db5b6a` test(client): page navigation and brief hooks (test-writer)

## Verdict

**Verifier verdict:** NOT VERIFIED, on the scope-drift rule alone. MET 53 · PARTIAL 0 · NOT MET 0 · UNVERIFIABLE 11.

**All P1 ACs MET?** Yes, for every P1 code AC: AC-1, 3, 5, 9, 13, 16, 20, 36, 37, 41, 43, 52, 54. Two P1 rows are process deliverables, not code, and are pending: AC-58 and AC-60 (S14, PR contents).

**Resolution of the scope drift (main session).** The verifier flagged two changed files that are neither in the File inventory nor in the deviation list it was given:

- `server/INSIGHTS.md` — the "`wrapUntrusted` escapes only the exact lowercase `</untrusted>`" Gotchas entry. Reported by the Phase 2 implementer under "Insights recorded"; required by the project's `engineering-insights` workflow.
- `client/src/components/diff-viewer/helpers.ts` — adds the neutral `DiffTarget {file, line}` type, re-exported through `diff-viewer/index.ts` (which is in the inventory). Listed in the Phase 3 implementer's changed files; the architecture review confirmed the viewer stays brief-agnostic.

Both were declared in the implementer reports but not forwarded to the verifier. They are accepted here as declared deviations. With them declared, the verdict is **VERIFIED WITH GAPS**. The remaining gaps are manual checks and process deliverables, listed under "Unclosed rows".

## Declared deviations

- The contract is `BriefRiskOut`; plan section 3 says `BriefRisk` (the S1 step defines `BriefRiskOut`).
- `service.ts` imports the pure ring-1 `classifyFile` from `modules/smart-diff/classify.ts` (architecture review: allowed).
- The specs port types (`BriefSpecsInput`, `BriefSpecsResolved`) are declared locally in `service.ts`.
- `BriefRepository.latestRunAgent` also scopes `agents.workspaceId` (stricter than the plan).
- `DiffTab/styles.ts` gains a `notInDiff` style.
- New `OverviewTab.test.tsx` (the plan allowed it).
- The `FileCard` mount-only scroll effect carries an `eslint-disable-next-line react-hooks/exhaustive-deps`.
- `DiffTab/index.ts` re-exports `parseDiffTarget` (fix for architecture finding A1).
- The test-writer added `page.test.tsx` and `lib/hooks/brief.test.tsx`.
- `server/INSIGHTS.md` and `diff-viewer/helpers.ts` (see Resolution above).

## Traceability matrix

Step rows are one per step. Each folds in that step's files, changes, tests, acceptance and verify, all of which were checked individually. `cli` = `client/src/app/repos/[repoId]/pulls/[number]`.

| ID | Item | Step | Test | Commit | Method | Status | Evidence |
|---|---|---|---|---|---|---|---|
| AC-1 | Overview shows the PR Brief block, Generate or the stored brief | S10, S11 | `OverviewTab.test.tsx` "exactly one 'Generate brief'…"; BriefCard "offers Generate…" | C3 | test+insp | MET | `OverviewTab.tsx` adds `<BriefCard prId onOpenFile/>` in a first section; client suite 169/169 PASS |
| AC-3 | Generate only on a user trigger | S5–S8, S10 | `brief-service` "one model call per generate, none on get"; `brief.it` "GET before any generation… zero model calls"; `brief.test.tsx` AC-43 | C2, C3, C4 | test | MET | `routes.ts` GET→`briefService.get`; hooks `enabled:!!prId`, POST only via mutate |
| AC-4 | Skeleton and disabled actions while unresolved or in flight | S8, S10 | BriefCard "…disabled action while generating"; "never an endless skeleton once prId resolves" | C3 | test+insp | MET | `BriefCard.tsx` `if (!prId \|\| isLoading \|\| generate.isPending)` → Skeleton with a disabled Button |
| AC-5 | Summary, Risk and Focus shown after generation | S10 | BriefCard "…then renders the brief"; `brief.test.tsx` AC-5/8 | C3, C4 | test | MET | `onSuccess` `setQueryData({brief, stale:false})` |
| AC-8 | Error with retry; the stored brief stays | S8, S10 | BriefCard "keeps a stored brief visible with an inline retry…"; `brief.test.tsx` AC-5/AC-8 | C3, C4 | test | MET | inline `role="alert"` plus `t("brief.retry")`; ErrorState only when `!brief` |
| AC-9 | Exactly one "Generate brief"; Intent relabelled "Derive intent" | S9, S11 | `OverviewTab.test.tsx`; `IntentCard.test.tsx` | C3 | test | MET | `brief.json`: `intent.generate` → "Derive intent" |
| AC-10 | All strings come from the `brief` namespace | S9, S10 | BriefCard tests assert visible strings | C3 | insp+test | MET | `brief.json` parses; new strings use `t("brief.*")` only |
| AC-13 | Plain text, severity as text, `file:line — reason` in model order | S10 | BriefCard "deep-links from risk files… renders model text literally" | C3 | test+insp | MET | no `dangerouslySetInnerHTML` in BriefCard; severity keys High/Medium/Low |
| AC-16 | Empty, removed and missing-facts notes | S9, S10 | BriefCard "marks a stale brief… notes empty/removed content" | C3 | test+insp | MET | `RiskList` `noRisks`; `FocusList` `focusEmpty`; `removedNote`, `generatedWithout` (includes `fact.noSpecs`) |
| AC-20 | Missing or degraded facts still generate, with the status recorded | S2, S5 | `brief-service` "degrades the facts but still generates…", "stale intent, unavailable blast…"; `brief-domain` deriveFacts ×3 | C2 | test | MET | `service.ts` isolates intent, blast, github and specs in try/catch; `deriveFacts` |
| AC-22 | Specs from the brief agent plus enabled skills; agent and paths recorded | S3, S4, S5 | `brief.repository.it` "latestRunAgent…", "enabledSkills honours both flags"; `brief-service` "no agent" | C2 | test | MET | `specDocs=[...contextDocs,...specsDocs]`; facts record the agent and paths |
| AC-26 | Exactly one structured call | S5, S7 | `brief-service` first test; `brief.it` "POST makes exactly one model call…" | C2 | test | MET | one `completeStructured` in `service.ts` |
| AC-27 | `risk_brief` provider and model, recorded | S2, S5, S7 | `brief.it` "…with the configured model" | C2 | test | MET | `container.ts` `resolveFeatureModel(this, ws, 'risk_brief')`; record carries provider and model |
| AC-28 | No diff body line or file content in the input | S3 | `brief-input` "lists paths, stats and changed ranges…"; `brief-service` "…no diff body" | C2 | test+insp | MET | file entry is `{path,additions,deletions,role,ranges}`; `formatRanges` only |
| AC-30 | First-sent input ≤ 8000; shares and reduction order recorded | S3 | `brief-input` "respects the shares and reduces in order…"; "reduces only as far as needed" | C2 | test | MET | budget 8000, shares 600/1500/2000/1500/2400, order `['specs','diff_stats','description']`. Real-LLM count: E2E-7 |
| AC-34 | Budget overflow: error, no call, brief unchanged | S3, S5 | `brief-input` "fails with a budget error…"; `brief-service` "a budget failure makes zero model calls… (422)" | C2 | test | MET | `AppError('brief_budget_exceeded',…,422)` raised before the LLM call |
| AC-35 | Untrusted blocks, guard text, case-insensitive sanitiser | S3 | `brief-input` "keeps injection strings, </UNTRUSTED> and newline paths inside their blocks" | C2 | test+insp | MET | `input.ts` `sanitizeUntrusted` / `sanitizeInline`; `wrapUntrusted` / `renderProjectDocBlock` |
| AC-36 | Output validated; a failure leaves the brief unchanged | S1, S3, S5, S7 | `contracts.test` BriefModelOutput; `brief-service` "invalid model output leaves stored brief unchanged… 502… logs once"; `brief.it` "…502 that keeps the old brief" | C1, C2 | test | MET | `schema: BriefModelOutput` passed to `completeStructured`; the failure is wrapped as `ExternalServiceError` |
| AC-37 | Grounding: drop refs, drop focus, snap lines, counts | S2, S5 | `brief-domain` groundBrief ×5 | C2 | test | MET | `groundBrief(result.data,{changed: ranges, callers})` |
| AC-41 | Contracts in both copies, identical | S1 | `contracts.test` BriefModelOutput | C1 | demo | MET | `diff` of both `brief.ts` copies → no output, exit 0 |
| AC-42 | Stored brief replaced with head SHA, time, facts, reductions and usage | S1, S4, S5, S7 | `brief.repository.it` "save then getStored round-trips, upsert replaces…"; `brief-service` (EC-20 SHA); `brief.it` | C1, C2 | test | MET | `onConflictDoUpdate({target: prBrief.prId,…})`; `head_sha` read at the start |
| AC-43 | Reload shows the brief with the stale flag; no generate, intent or blast | S4–S8 | `brief.it` "POST…; GET reads it back without a call"; `brief.test.tsx` AC-43 | C2, C4 | test | MET | `BriefService.get` calls only `loadPull` and `getStored` |
| AC-45 | Refresh offered, "Outdated" text, no auto-regenerate | S2, S7, S9, S10 | BriefCard "marks a stale brief Outdated, refresh regenerates"; `brief-domain` isStale; `brief.it` "flips stale when the head moves" | C2, C3 | test | MET | Badge `t("brief.outdated")`, Refresh Button; `isStale` false for an unknown head |
| AC-46 | 422 with no files, 429 over 10/min, no model call | S4–S7 | `brief-routes.test` rate limit; `brief.it` "no pr_files is a 422 with no model call"; `brief-service` "no changed files → ValidationError" | C2 | test | MET | `config:{rateLimit: BRIEF_RATE_LIMIT}` (10, 1 minute); 11th POST → 429 |
| AC-49 | Missing or cross-workspace PR → 404 | S4–S7 | `brief.it` "…cross-workspace PR is a 404"; `brief.repository.it` | C2 | test | MET | `NotFoundError`; repository queries filtered by `workspaceId` |
| AC-51 | One content-free log line per generation; usage stored | S1, S5, S6, S7 | `brief-service` "invalid output… still logs once", "duration_ms_non_model excludes the model call time" | C1, C2 | test+insp | MET | `finally{ opts.onFinish?.(line) }`; `req.log.info(line,'brief: generated')`. Real-server count: E2E-6 |
| AC-52 | Click opens the file expanded (including a collapsed group), scrolls, highlights, adds a history entry | S10, S12, S13 | `DiffTab.test` deep-link tests; `page.test` "opening a file from the brief pushes a history entry…"; BriefCard deep-link test | C3, C4 | test+insp | MET | `openFile`→`navigate(sp,"push")`; `SmartDiffGroups` expands the target's group; `FileCard` `scrollIntoView`; `CodeLine` `data-new-line`. Browser Back: E2E-10 |
| AC-54 | Not-in-diff message naming the file | S9, S12, S13 | `DiffTab.test` "an unknown file shows the not-in-diff note…"; `helpers.test` parseDiffTarget ×3 | C3 | test | MET | `target && !inDiff` → `tBrief("brief.notInDiff",{file})` |
| AC-58 | Spec and plan committed before feature code | S14 | — | 9adcc28 | analysis | UNVERIFIABLE | `9adcc28` precedes `7b8fa67`, so the order holds; PR-contents check pending (S14) |
| AC-60 | PR description, demo, cross-model note, verifier report | S14 | — | — | — | UNVERIFIABLE | PR not opened yet |
| NFR-1 | Untrusted input; model output treated as untrusted | S3, S5, S10, S12 | brief-input injection test; domain grounding; BriefCard literal-render test | C2, C3 | test | MET | see AC-35, AC-37, AC-13; `parseDiffTarget` plus `files.some` only compare, never fetch |
| NFR-2 | Logs content-free, no secrets | S5, S6 | `brief-service` log tests | C2 | insp | MET | `BriefLogLine` holds ids, counts, tokens, cost and timing only |
| NFR-3 | Workspace tenancy | S4, S7 | `brief.repository.it`, `brief.it` cross-workspace cases | C2 | test | MET | workspace predicates on every repository query |
| NFR-4 | One call, ≤ 8000 in, 1500 out, rate limit | S3, S5, S6 | see AC-26/30/46 | C2 | test | MET | `BRIEF_MAX_TOKENS=1500` passed as `maxTokens` |
| NFR-5 | Read p95 ≤ 300 ms, non-model ≤ 3 s | S5 | `brief-service` fake-clock test (field logic only) | C2 | — | UNVERIFIABLE | needs the dev stack: 20× curl on GET, `duration_ms_non_model` from a POST log line |
| NFR-6 | Accessibility | S10 | BriefCard tests | C3 | insp+test | MET | `aria-live="polite"`; file refs and focus rows are `<button>`s; severity and Outdated are text |
| NFR-7 | i18n, no duplicate top-level keys | S9, S10 | JSON.parse check | C3 | demo | MET | only a nested `brief` group added |
| NFR-8 | Compatibility | S11, S12 | DiffTab "without a target nothing scrolls and no note is shown"; existing DiffTab and diff-viewer tests | C3 | test | MET | client suite 47 files / 169 tests PASS |
| S1 | Shared contracts, both copies, contracts test | S1 | `contracts.test` | C1 | insp+test | MET | byte-identical copies |
| S2 | Constants and domain | S2 | `brief-domain.test.ts` (11) | C2 | test | MET | constants match the plan |
| S3 | `input.ts`, `prompt.ts` | S3 | `brief-input.test.ts` (6) | C2 | test | MET | |
| S4 | `repository.ts` | S4 | `brief.repository.it.test.ts` (5) | C2 | test | MET | executed against Docker (~3.1 s), not skipped |
| S5 | `service.ts` | S5 | `brief-service.test.ts` (9) | C2 | test | MET | narrow ports; no drizzle or fastify import |
| S6 | `routes.ts`, `modules/index.ts`, `container.ts` | S6 | indirect via S7 | C2 | insp | MET | one import plus one entry in `modules/index.ts`; container getters match the plan |
| S7 | `brief.it` and `brief-routes` tests | S7 | `brief.it.test.ts` (4), `brief-routes.test.ts` (2) | C2 | test | MET | IT executed (~3.2 s); no 429 case in the IT, as the plan says |
| S8 | `lib/hooks/brief.ts` | S8 | `brief.test.tsx` | C3, C4 | insp+test | MET | `enabled:!!prId`; writes only in `onSuccess`; not in the barrel |
| S9 | `brief.json` keys, IntentCard label | S9 | `IntentCard.test.tsx` | C3 | test | MET | see AC-9/10 |
| S10 | BriefCard plus RiskList and FocusList | S10 | `BriefCard.test.tsx` (5) | C3 | test | MET | all plan cases covered |
| S11 | OverviewTab wiring | S11 | `OverviewTab.test.tsx` | C3 | test | MET | new first section, `onOpenFile` prop |
| S12 | Deep link: DiffTab, SmartDiffGroups, diff-viewer, helpers | S12 | `DiffTab.test.tsx` (4 new), `helpers.test.ts` (3 new) | C3 | test | MET | `key` re-mount, `FileCard` mount effect, `CodeLine` highlight, `DiffTarget` exported |
| S13 | `page.tsx` push navigation | S13 | `page.test.tsx` (3) | C3, C4 | test | MET | `setTab` clears file and line; `openFile` pushes |
| S14 | Process deliverables | S14 | — | — | — | UNVERIFIABLE | main-session step, pending |
| INV | File inventory | — | — | — | analysis | MET | every inventory file is in the diff; drift resolved above |
| SCOPE.out | Out of scope stays untouched | — | — | — | analysis | MET | no `db/**`, migration, `app.ts`, `reviewer-core/**`, `adapters/llm/**`, `e2e/**` or lockfile change; no queue, VerdictBanner, expandable risk, COST change or doc-writer output |
| E2E-1 | Contracts diff | — | — | — | demo | MET | exit 0 |
| E2E-2 | Server typecheck and vitest (hermetic + IT) | — | — | — | demo | MET | see Commands |
| E2E-3 | Client typecheck and test | — | — | — | demo | MET | see Commands |
| E2E-4 | `cd client && pnpm build` | — | — | — | — | UNVERIFIABLE | not in the verifier's command set; passed in Phase 3 before the A1 fix, to be re-run |
| E2E-5 | Dev-stack demo walk (generate, reload, focus click, risk click, blast-only file, head_sha → Outdated) | — | — | — | — | UNVERIFIABLE | pending manual |
| E2E-6 | Single real `brief: generated` log line per POST | — | — | — | — | UNVERIFIABLE | pending manual |
| E2E-7 | Real-LLM input ≤ 8000 tokens | — | — | — | — | UNVERIFIABLE | pending manual |
| E2E-8 | GET p95 ≤ 300 ms | — | — | — | — | UNVERIFIABLE | pending manual (20× curl) |
| E2E-9 | `duration_ms_non_model` ≤ 3000 ms | — | — | — | — | UNVERIFIABLE | pending manual |
| E2E-10 | Browser Back from Files changed returns to Overview | — | `page.test` asserts push | C4 | — | UNVERIFIABLE | pending manual |

Edge cases EC-1…EC-32 were checked through the AC rows and step tests above:

- Facts: EC-1–7 (`brief-service`, `brief-domain` deriveFacts).
- Budget: EC-8–10, EC-31 (`brief-input`, `brief-service`).
- Grounding: EC-11–15 (`brief-domain`).
- Provider errors: EC-16–18 (`brief-service`, `brief-input`).
- Staleness and head SHA: EC-19, 20, 24, 25 (`brief.it`, `brief-service`).
- Rejected requests: EC-22, 23, 30 (`brief-routes`, `brief.it`, `brief-service`).
- Client: EC-26–29, 32 (`DiffTab.test`, BriefCard tests).
- EC-21: last write wins (`onConflictDoUpdate`); the action is disabled while in flight.

## Commands run

| Command | Result |
|---|---|
| `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` | exit 0, no output |
| `cd server && pnpm typecheck` | exit 0 |
| `cd server && pnpm exec vitest run test/contracts.test.ts test/brief-*.test.ts test/brief*.it.test.ts` | 7 files, 53 tests passed; both `*.it.test.ts` executed against Docker, not skipped |
| `cd server && pnpm test` (full, includes all `*.it`) | 55 files, 444 tests passed |
| `cd client && pnpm typecheck` | exit 0 |
| `cd client && pnpm test` | 47 files, 169 tests passed |
| `node -e JSON.parse(messages/en/brief.json)` | exit 0 |

## Unclosed rows before merge

- **AC-58, AC-60, S14:** process deliverables. The PR description, demo video, cross-model note (`docs/plans/pr-brief-plan-crossreview.md`) and this report must be linked from the PR. AC-58 ordering already holds.
- **NFR-5, E2E-5…E2E-9:** manual checks on `./scripts/dev.sh` with a real LLM key:
  - generate once and count `brief: generated` lines (expect 1);
  - check input tokens ≤ 8000;
  - run 20× curl on GET (p95 ≤ 0.3 s);
  - read `duration_ms_non_model` (≤ 3000 ms);
  - change `pull_requests.head_sha` and expect Outdated.
- **E2E-10:** in a browser, click a focus item, then Back; expect Overview.
- **E2E-4:** re-run `cd client && pnpm build`.
