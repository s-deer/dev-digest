# Development Plan: PR Brief — design alignment (revision 2)
**Status:** approved (user, 2026-10-11)
**Goal:** Bring the shipped PR Brief block in line with the Lab 05 design, and add a grounded, nullable `line` on risks. Revision 1 stays as built. Only the revision-2 delta is planned.
**Source spec:** `specs/2026-10-10-pr-brief.md` (approved, revision 2, 2026-10-11, R2-5 applied)
**Execution mode:** multi-agent. One implementer per phase (A, B, C, D), run sequentially.

## 1. Context & sources consulted
- Read:
  - `specs/2026-10-10-pr-brief.md` in full (AC-1…AC-78, EC-1…EC-51, NFR-1…NFR-8, Contracts, Verification hints, Decisions R2-1…R2-5).
  - `docs/plans/pr-brief-design-gaps.md` (G1–G16).
  - Server: `server/src/vendor/shared/contracts/brief.ts` (the client copy is byte-identical today, checked with `diff`), `server/src/modules/brief/{domain,prompt,constants}.ts`, and the grounding call in `service.ts` (~l.261-283).
  - Client brief UI: `BriefCard/{BriefCard.tsx,helpers.ts,styles.ts,_components/RiskList,_components/FocusList}`, `OverviewTab`, `IntentCard` (+ `IntentEmpty`, `styles.ts`), `BlastRadiusCard.tsx`, `VerdictBanner`, `ReviewRunAccordion` (verdict, score and blockers usage), `DiffTab.tsx`, `DiffTab/constants.ts` (`STICKY_TOP_OFFSET = 132`), and `page.tsx` (`openFile`, `usePrReviews`).
  - Client shared pieces: `client/src/lib/toast.tsx`, `client/src/components/diff-viewer/{FileCard,CodeLine,styles}`, `client/src/app/globals.css`, `client/src/vendor/ui/styles.css` (reduced-motion block), `client/messages/en/brief.json`.
  - `ReviewRecord` shape in `review-api.ts`: `verdict`, `score`, `findings`, `cost_usd`, `created_at`.
  - Test inventory: `server/test/brief-{domain,input,service,routes}.test.ts`, `brief.it.test.ts`, `brief.repository.it.test.ts`, `contracts.test.ts`. Client tests under `BriefCard/`, `OverviewTab/`, `IntentCard/`, `VerdictBanner/`, `DiffTab/`, `page.test.tsx`.
  - `docs/agent-prompts/README.md`: it covers the built-in reviewer agents, not the brief's `SYSTEM_PROMPT`.
  - Verified by the coordinator (not re-run here): both LLM adapters send `strict: true` through openai's `zodResponseFormat` (`server/src/adapters/llm/openai.ts:105`, `reviewer-core/src/llm/openrouter.ts:76`). Under it, a Zod `.optional()` becomes a required, non-null property, and `.nullable()` becomes `anyOf [integer, null]`. This is recorded in the spec as R2-5.
- Applied INSIGHTS (named in the spec; the INSIGHTS files themselves were not re-read):
  - server "A Zod `.optional()` field in a model-output schema becomes a required, non-null property in strict structured output" (R2-5): the model-output risk `line` is `.nullable()`, never `.optional()` or `.nullish()`. `.nullish()` is allowed only on the stored record's schema, which the strict converter never sees. A test guards the converter output.
  - server "observe-before-judge field order": `line` sits right after `file_refs`, before `explanation`, `kind` and `severity`.
  - server "shared copies drifted": port only `brief.ts`; verify with `diff` of those two files only.
  - server "`pnpm typecheck` skips `server/test/**`": run `pnpm test`.
  - server "`*.it.test.ts` must mock `llm.openrouter` and `github`".
  - client "disabled TanStack Query keeps `isPending: true`": gate on `!prId || isLoading`.
  - client "duplicate top-level JSON keys" and "`next-intl` MISSING_MESSAGE doesn't throw": add keys inside the existing nested objects, and assert visible strings.
  - client "RTL `getByText` vs wrapped counts": use `textContent` matchers for the focus rows, the count badge and "N findings · M blockers".
  - client "SVG `<title>` double match": query severity by role or accessible name, or with `getAllByText`.
  - root "plan-verifier cannot run `pnpm build`": the main session runs `cd client && pnpm build`.
- Git history: no reverted reference design is needed for this delta.
- Onion note: no known deviation is touched on the server. The brief module is already sliced correctly, and the grounding change stays in pure `domain.ts`.

## 2. Scope
- In scope:
  - **Contracts and server:** the nullable model-output risk `line`, the matching tolerant stored-record schema, the optional grounding counters, risk-line snapping in `groundBrief`, and the prompt's kind list and line rule.
  - **Client structure:** one PR Brief block (banner, two-column area, Review focus, notes), skeleton, empty states and the Intent texts.
  - **Client behaviour:** risk pills with icons and a single-open expand, the not-in-diff notice, and the arrival presentation on Files changed.
- Out of scope:
  - No DB migration or new storage (the brief JSON is schemaless; the new record fields are nullish or optional).
  - No reviewer-core or LLM adapter changes, and no change to how Intent, Blast, Smart Diff or Project Context compute.
  - No Prior PRs (G16), no e2e flow, no new API endpoint, no markdown rendering.
  - No change to `VerdictBanner` as used by `ReviewRunAccordion`.
  - No change to any other toast's look, duration or position.
  - No edits in `server/clones/**`, migrations or lockfiles.
- Assumptions:
  - `usePrReviews` data is newest-first, but the pick helper sorts by `created_at` itself.
  - The Files changed address contract is unchanged.
  - `IconBtn`, `SectionLabel`, `CircularScore` and `Icon.{Shield,Database,AlertOctagon,Zap,Boxes,ListChecks,RefreshCw,Info,FileText,Target,Workflow,AlertTriangle}` exist in `@devdigest/ui`. The icon names were confirmed in `icons.tsx`; `IconBtn` props must be read by the implementer.

### Design decisions taken by this plan
- **D-a Banner:** add a dedicated `BriefBanner` under `BriefCard/_components/`. Do **not** reuse `VerdictBanner` as is.
  - Why: `VerdictBanner` requires a verdict. It shows the score column, and therefore the cost, only when `score != null`. It always shows the findings badge and has no refresh, outdated or hint slots. AC-65/66/68 need cost and refresh without a review, a spinner in the score slot, and no verdict tile.
  - Changing `VerdictBanner` would risk `ReviewRunAccordion` and the Findings tab (NFR-8).
  - `BriefBanner` reuses the same primitives and metadata: `VERDICT_META` from `VerdictBanner/constants`, `Badge`, `CircularScore`, `RunCostBadge`, `IconBtn`, and the `prReview` namespace labels. This is allowed by AC-10.
- **D-b Toast:** extend `client/src/lib/toast.tsx` additively. Add a `warn` kind with a ⚠ glyph and warning colours, and an optional `{ durationMs, key }` option on `push`/`notify.warn`.
  - The default stays 4000 ms.
  - A repeated `key` replaces the existing item and restarts its timer (P-11, EC-44).
  - The position stays bottom-right, which is allowed by P-11. The existing `role="status" aria-live="polite"` container covers NFR-6.
- **D-c Intent and Blast embedding:** `IntentCard` stops owning its `Card`, grid and full-width empty card. It renders only its content: heading, block, compact empty state, skeleton or error. `BriefCard` owns the left `Card`. `BlastRadiusCard` keeps its own `Card` and logic, and gains its `Workflow` "Blast radius" `SectionLabel` inside the card in every state. The outer `SectionLabel`s in `OverviewTab` go away.
- **D-d Two contract schemas for a risk (R2-5):**
  - `BriefRiskOut` is the **model-output** risk. It has `line: z.number().int().min(1).nullable()` right after `file_refs`. It has no `.optional()` or `.nullish()` anywhere, and `BriefModelOutput` has none either.
  - `BriefRiskRecord` is the **stored/API** risk: `BriefRiskOut.extend({ line: z.number().int().min(1).nullish() })`. `.extend` keeps the key position, so `line` stays right after `file_refs`. `PrBriefRecord.risks` uses `BriefRiskRecord`. Readers treat missing and null the same.
  - `BriefGrounding` keeps the two risk-line counters optional. `BriefGrounding` is part of the stored record only, never of the model output.
  - `groundBrief` always sets `line` on a stored risk, to a number or to `null`.
- **D-e Arrival scroll offset (user accepted, 2026-10-11):** a fixed constant `TARGET_SCROLL_OFFSET = 148` in `diff-viewer/constants.ts` (≥ `STICKY_TOP_OFFSET` = 132). No runtime measurement.
- **D-f Intent heading (user accepted, 2026-10-11):** the Intent heading appears only in Intent's ready state. Its skeleton and error states render without a heading.

## 3. Architecture & constraints
- **Server:** `modules/brief`
  - Ring 1: `domain.ts` (`groundBrief`) and `prompt.ts` (constant text). No ring crossing.
  - `service.ts` and the log line already carry the whole `grounding` object. They only need verifying, not restructuring.
  - No repository change, because stored JSON is parsed by `PrBriefRecord`, whose new fields are tolerant.
- **Client:** `client/src/app/repos/[repoId]/pulls/[number]/`
  - `page.tsx` (route glue only): passes `reviews` and `files` down and owns `openFile`.
  - `_components/`: `OverviewTab`, `BriefCard` (+ new private `_components/{BriefBanner,BriefSkeleton,BriefEmpty,BriefGrid,ReviewFocusBlock}`, `RiskList`, `FocusList`), `IntentCard`, `BlastRadiusCard`.
  - Shared: `client/src/lib/toast.tsx`, `client/src/components/diff-viewer/*`, `client/src/app/globals.css`.
  - i18n: `client/messages/en/brief.json` only (inside its nested objects).
  - Pure logic goes in `helpers.ts` (verdict-review pick, counts, kind→icon map).
- **Contracts (`@devdigest/shared`, both copies, identical edit):**
  - `BriefRiskOut` (model output) gains `line: z.number().int().min(1).nullable()` directly after `file_refs`.
  - New `BriefRiskRecord` (stored/API) as in D-d. `PrBriefRecord.risks` becomes `z.array(BriefRiskRecord)`. Export `BriefRiskRecord` and its type.
  - `BriefGrounding` gains `risk_lines_snapped: z.number().int().optional()` and `risk_lines_dropped: z.number().int().optional()`.
  - `kind` stays `z.string()`.
- **DB / migrations:** none.
- **Package managers:** pnpm in `server/` and `client/`.

## 4. Steps

### Phase A — shared + server (G11, G10-B)

### S1 — Shared contracts: nullable model-output risk line, tolerant record, optional counters  [package: shared] [depends on: —]
- AC: AC-41, AC-74, AC-73 (output contract still accepts any `kind` and a null `line`), EC-37, EC-51
- Files: modify `server/src/vendor/shared/contracts/brief.ts` · modify `client/src/vendor/shared/contracts/brief.ts` · modify `server/test/contracts.test.ts`
- Change:
  - In `BriefRiskOut`, insert `line: z.number().int().min(1).nullable()` immediately after `file_refs`, before `explanation`. It is required-nullable, never `.optional()`.
  - Add `BriefRiskRecord = BriefRiskOut.extend({ line: z.number().int().min(1).nullish() })` plus its type, and use it for `PrBriefRecord.risks`. Add a comment: the model output is strict structured output, so no `.optional()` or `.nullish()` may reach the strict converter. The record is never sent to the model.
  - In `BriefGrounding`, add the two optional counters `risk_lines_snapped` and `risk_lines_dropped`. A comment says that absent counters mean zero.
  - `BriefModelOutput` is unchanged except through `BriefRiskOut`. Check that no field in it uses `.optional()` or `.nullish()`.
  - Apply the same edit to both copies. Do not touch any other file in the vendor trees.
  - Check other users of `BriefRiskOut` as a stored type (`grep -rn "BriefRiskOut" server/src client/src`) and switch stored-record uses to `BriefRiskRecord`: `GroundedBrief.risks` in S2, and the client components in S10.
- Skills & rules:
  - `zod` — "use `.nullable()` for a value the model may leave empty and `.nullish()` only on read-side record schemas; export schema + inferred type".
  - `onion-architecture` — "contract first, then the targeted diff to the client copy".
  - `typescript-expert` — "no `any`".
- Tests: update `server/test/contracts.test.ts` (hermetic). Cases:
  - a revision-1 `PrBriefRecord` (risks without `line`, grounding without the counters) parses;
  - a record whose risk has `line: null` parses, and one with `line: 12` parses;
  - `BriefModelOutput` accepts a risk with `line: null` and with `line: 12`;
  - `BriefModelOutput` rejects a risk with the `line` key missing (it is required-nullable);
  - `line: 0`, `1.5` and `"3"` are rejected in both schemas;
  - an unlisted `kind` (`"api-contract"`, `"Security"`) is accepted;
  - the key order of `BriefRiskOut.shape` and `BriefRiskRecord.shape` is `file_refs, line, explanation, title, kind, severity`;
  - **strict-mode guard:** the JSON schema produced for `BriefModelOutput` has, for every object in it, every property listed in `required`. Use the same converter the adapters use if one is importable in a hermetic test (`zodResponseFormat` from `openai/helpers/zod`, as in `server/src/adapters/llm/openai.ts:105`), otherwise `toJsonSchema` / `z.toJSONSchema`. State in the test which one is used. The `line` property must be `anyOf [integer, null]`.
- Acceptance: both copies are identical, old and null-line records parse, and the strict-mode guard passes (AC-41, AC-74).
- Verify: `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts && cd server && pnpm test -- contracts && pnpm typecheck`

### S2 — Server: ground risk lines  [package: server] [depends on: S1]
- AC: AC-37, AC-51, EC-33, EC-34, EC-35, EC-51
- Files: modify `server/src/modules/brief/domain.ts` · modify `server/test/brief-domain.test.ts` · modify `server/test/brief-service.test.ts` (log-line assertions)
- Change in `groundBrief`:
  - Extract the existing focus snap (in-range, then caller-line, then nearest range start, then nearest caller line, else `undefined`) into a pure `snapLine(file, line, ctx): { line: number; snapped: boolean } | null`. Focus and risk lines both use it, so the tie rules stay identical. Do not duplicate the logic.
  - `GroundedBrief.risks` becomes `BriefRiskRecord[]`.
  - Risk handling, per risk:
    - Filter the refs as today and drop the risk (counting `risks_dropped`) if no refs survive. Its line is then not counted.
    - If the model's `line` is `null`, set `line: null`. Count nothing (EC-51).
    - If the model supplied a number, keep it only if the model's first ref (`risk.file_refs[0]`) survived filtering and is the first of the surviving refs. If it did not, set `line: null` and count `risk_lines_dropped` (P-7, EC-35).
    - Otherwise run `snapLine`. If it returns a line, set it (`snapped: true` counts `risk_lines_snapped`, an unchanged grounded line counts nothing). If it returns null, set `line: null` and count `risk_lines_dropped` (EC-34).
  - Always emit both new counters (numbers, possibly 0) in `grounding` for new briefs.
  - A risk always gets an explicit `line` (number or null) in the stored shape. Never `undefined`.
  - Update the doc comment.
  - `service.ts` already assigns `line.grounding = grounded.grounding` and stores it, so the usage/log carry the counters (AC-51). Do not add content to the log line.
- Skills & rules:
  - `onion-architecture` — "ring 1 `domain.ts` imports only `@devdigest/shared`; no I/O".
  - `typescript-expert` — "explicit return types on exported functions; no `any`; the `noUncheckedIndexedAccess` guards already used".
  - `onion-architecture` — "the log line carries counts only, never text".
- Tests (hermetic): extend `brief-domain.test.ts`. Cases:
  - risk line in range, kept unchanged and not counted;
  - out-of-range, snapped to the nearest range start (tie → earlier range), `risk_lines_snapped = 1`;
  - caller-line equality, kept;
  - the first ref has no ranges but has caller lines, snapped to the nearest caller line;
  - the first ref has neither (binary file), line becomes null, risk kept, `risk_lines_dropped = 1`;
  - first ref removed while another survives, line becomes null, counted, and not moved to the new first ref (EC-35);
  - the whole risk dropped, line not counted;
  - a risk with `line: null` stays null, and both counters stay 0 (EC-51);
  - every grounded risk has an own `line` property;
  - focus behaviour and `focus_lines_snapped` unchanged (existing tests stay green).
  - In `brief-service.test.ts`, assert the structured log line includes the two new counters and no summary or explanation text, and that the mocked model response used there carries `line: null` or a number on every risk.
- Acceptance: all hermetic grounding cases pass and the old focus tests are untouched (AC-37, AC-51).
- Verify: `cd server && pnpm test -- brief-domain brief-service && pnpm typecheck`

### S3 — Server: prompt kind list + risk-line rule  [package: server] [depends on: S1]
- AC: AC-73, AC-28 (still no hunk bodies), AC-30 (instructions inside the same 8 000 budget), NFR-4
- Files: modify `server/src/modules/brief/prompt.ts` · modify `server/src/modules/brief/constants.ts` (bump `BRIEF_PROMPT_VERSION` to `'brief-v2'` if the constant is used for logging or caching only; grep first and leave unchanged if it is stored or compared) · modify `server/test/brief-input.test.ts` (or the file that already asserts `SYSTEM_PROMPT`)
- Change in the `risks:` paragraph of `SYSTEM_PROMPT`:
  - Replace the free-form kind hint with: `kind` must be exactly one of `security`, `db_migration`, `breaking_api`, `perf`, `deps`, `other`.
  - Keep `file_refs` as bare paths with no line numbers.
  - Add: after `file_refs`, `line` is a head-side line number of the FIRST file in `file_refs`, taken from the listed changed ranges or caller locations of that file; use `null` when there is no single line. Never invent one. (The field is required but nullable under strict output.)
  - Keep the field order: file_refs, line, explanation, title, kind, severity.
  - Per `CLAUDE.md`, `docs/agent-prompts/README.md` was checked; it governs reviewer agents only, and no edit there is needed.
  - Keep the text tight so `input_tokens_total` stays well under 8 000.
- Skills & rules:
  - `zod` — "the output contract still accepts any string `kind` (instructions guide, schema stays permissive)".
  - `onion-architecture` — "the prompt is a ring-1 constant, trusted text".
- Tests (hermetic):
  - assert `SYSTEM_PROMPT` contains the six kinds exactly, the line rule and the `null` instruction;
  - assert it still contains no mention that would allow `path:line` in `file_refs`;
  - assert a built request for a typical input stays ≤ 8 000 with the tokenizer used by the existing budget tests;
  - assert a model response with an unlisted `kind` and with `line: null` still validates through `BriefModelOutput`.
- Acceptance: the instruction test and the budget test pass.
- Verify: `cd server && pnpm test -- brief-input && pnpm typecheck`

### S4 — Server: backward-compat read of stored records + generation round trip  [package: server] [depends on: S1, S2]
- AC: AC-74, EC-37, EC-51, AC-43, AC-42
- Files: modify `server/test/brief.it.test.ts` (or `brief.repository.it.test.ts`, whichever already seeds a stored brief)
- Change: test-only.
  - Seed a revision-1 shaped document (no risk `line`, no risk-line counters, free-form `kind: "api-contract"`) directly through the repository. `GET /pulls/:id/brief` returns it with 200 and `stale`, and the stored JSON is byte-for-byte unchanged afterwards.
  - Seed a second record whose risk has `line: null`. It reads the same way.
  - A fresh POST with a mock LLM returns three risks. One has an out-of-range `line` (it is stored snapped, with `risk_lines_snapped = 1`), one has `line: null` (stored as null, nothing counted), and one has a `line` on a file with no ranges and no callers (stored as null, `risk_lines_dropped = 1`).
- Skills & rules:
  - `*.it.test.ts` is DB-backed (testcontainers); mock `llm.openrouter` and `github` via `server/src/adapters/mocks.ts`.
  - `onion-architecture` — "repository tests as `*.it.test.ts`".
- Tests: `it`.
- Acceptance: GET of the old and null-line records succeeds unchanged; POST stores the grounded lines and counters.
- Verify: `cd server && pnpm test -- brief` (Docker required for the `.it` files; if Docker is unavailable, report it and still run the hermetic ones)

### Phase B — client block structure (G1–G7, G13)

### S5 — i18n keys + pure helpers  [package: client] [depends on: S1]
- AC: AC-10, AC-64, AC-69, AC-70, AC-65, AC-66, AC-71, NFR-7
- Files: modify `client/messages/en/brief.json` · modify `client/src/app/repos/[repoId]/pulls/[number]/_components/BriefCard/helpers.ts` · create `.../BriefCard/helpers.test.ts`
- Change in `brief.json` (new keys only inside the existing nested objects; no new top-level duplicates):
  - `brief.emptyTitle` = "No brief yet".
  - `brief.emptyBody` = "Generate a Why+Risk brief for this PR.".
  - `brief.focusTitle` = "Review focus — read these first".
  - `brief.refreshAria` = "Re-run the brief for this PR".
  - `brief.hint` (banner hint), `brief.hintLabel`, and `brief.tokens` / `brief.costUnknown` if needed.
  - `brief.riskWhy` = "Why this is a risk".
  - `brief.severity.*` accessible names (reuse the existing High/Medium/Low).
  - `brief.focusCount`.
  - `intent.emptyTitle` = "No intent yet".
  - `intent.emptyBody` = "Derive the PR intent from its title, body and linked issue.".
  - `intent.generateError` = "Couldn't derive the PR intent." (names the intent, P-17).
  - Remove the now-unused `brief.summary` and `intent.briefLabel` only if no longer referenced; grep first.
- Change in `helpers.ts` (pure, no React):
  - `pickVerdictReview(reviews: ReviewRecord[] | undefined | null)`: sort by `created_at` descending and return the first review whose `verdict` is non-null, else `null`. An older review is used when the newest has no verdict (EC-38).
  - `reviewCounts(review)`: `{ findings: all findings, blockers: findings with severity CRITICAL and !dismissed_at }` (P-14, the same rule as `ReviewRunAccordion`).
  - `RISK_ICON_NAMES` as an exact-match map: security→Shield, db_migration→Database, breaking_api→AlertOctagon, perf→Zap, deps→Boxes, with `iconNameForKind(kind)` returning `"AlertTriangle"` for anything else (P-12). Use `Object.hasOwn` or a `Map` so `"constructor"` and `"toString"` do not match.
  - `riskRef(risk: BriefRiskRecord)`: the first file reference, plus `:line` only when `risk.line` is a number (missing and null are the same).
  - Keep `SEVERITY_COLOR`.
- Skills & rules:
  - `react-architecture` — "pure business rules are plain TS functions in the feature folder, no React import".
  - `react-best-practices` — "helpers outside component bodies".
  - `react-testing-library` — "assert visible strings; `next-intl` only logs MISSING_MESSAGE".
  - client INSIGHTS "duplicate top-level JSON keys".
- Tests: `helpers.test.ts` (hermetic). Cases:
  - the verdict pick skips a newer review with no verdict;
  - undefined or empty input gives null;
  - the counts exclude dismissed findings;
  - the icon map covers the five kinds and falls back for `other`, `api-contract`, `Security` and `constructor`;
  - `riskRef` shows only the file for a risk with `line` null and for one with `line` missing, and `file:line` for a numeric line.
- Acceptance: helper tests pass and `brief.json` parses with no duplicate key (a JSON.parse test, or `node -e` check, passes).
- Verify: `cd client && pnpm test -- BriefCard/helpers && pnpm typecheck`

### S6 — Toast: warn kind with custom duration  [package: client] [depends on: —]
- AC: AC-76, EC-44, NFR-6, NFR-8
- Files: modify `client/src/lib/toast.tsx` · create `client/src/lib/toast.test.tsx`
- Change:
  - Extend `ToastKind` with `"warn"` and `COLORS.warn` (`--warn-bg`, `--warn` border, "⚠" glyph).
  - `push(message, kind, opts?: { durationMs?: number; key?: string })`. The default duration stays 4000. Track timers in a `useRef<Map>`; clear them on unmount.
  - With a `key`, an existing toast with the same key is replaced and its timer restarted, so only one is visible (P-11).
  - Add `notify.warn(message, opts)` and the matching hook method.
  - Do not change the other kinds' colours, duration or position.
- Skills & rules:
  - `react-best-practices` — "clean up timers in effects" and "`aria-live=polite`" (the existing container already has `role=status aria-live=polite`).
  - `react-architecture` — "`src/lib` holds configured infrastructure".
- Tests: `toast.test.tsx` (fake timers). Cases:
  - a `warn` toast with 2600 ms is gone at 2600 ms;
  - a repeated activation with the same key keeps one toast and restarts the timer;
  - the default toast still lasts 4000 ms.
- Acceptance: the three timer tests pass.
- Verify: `cd client && pnpm test -- toast && pnpm typecheck`

### S7 — IntentCard + BlastRadiusCard embeddable  [package: client] [depends on: S5]
- AC: AC-64, AC-70, AC-63, EC-49, NFR-8
- Files: modify `.../IntentCard/IntentCard.tsx` · modify `.../IntentCard/styles.ts` · modify `.../IntentCard/_components/IntentEmpty/IntentEmpty.tsx` · modify `.../IntentCard/IntentCard.test.tsx` · modify `.../BlastRadiusCard/BlastRadiusCard.tsx` · modify `.../BlastRadiusCard/BlastRadiusCard.test.tsx`
- Change:
  - `IntentCard` renders no `Card`/`dataGrid` of its own. States:
    - ready: `SectionLabel Target` "Intent" followed by `IntentBlock`. This is the only state with the Intent heading (D-f);
    - loading: `IntentSkeleton`, compact, no heading;
    - empty: compact `IntentEmpty`, with no 320 px card or icon tile. It uses the new "No intent yet" texts and the "Derive intent" button;
    - error: `ErrorState` with the intent-naming text, no heading.
  - The left card wrapper moves to `BriefGrid` in S8. Remove the unused `dataGrid`/`emptyCard` styles.
  - `BlastRadiusCard` keeps its `Card` and logic. Add `SectionLabel icon="Workflow"` "Blast radius" (`t` from `block.blast`) as the first child inside the card in all branches (loading, error, ready), exactly once.
  - Do not change how Intent or Blast compute.
- Skills & rules:
  - `react-architecture` — "components keep one reason to change; the parent composes".
  - `react-best-practices` — "early returns for loading/error/empty; no render factories".
  - client INSIGHTS "disabled TanStack Query keeps `isPending`" — keep the `!prId || isLoading` gates.
  - `react-testing-library` — "test behaviour; update only the changed strings".
- Tests: update the `IntentCard` and `BlastRadiusCard` tests (hermetic, mocked hooks). Cases:
  - the new empty texts;
  - the Intent heading appears once in the ready state and not in the skeleton or error states;
  - the error text names the intent;
  - the Blast heading renders in each state.
- Acceptance: `IntentCard` and `BlastRadiusCard` render without their own outer Card or duplicate headings, and tests are green.
- Verify: `cd client && pnpm test -- IntentCard BlastRadiusCard && pnpm typecheck`

### S8 — BriefCard composition: banner, grid, skeleton, empty, notes, error row  [package: client] [depends on: S5, S6, S7]
- AC: AC-1, AC-4, AC-5, AC-8, AC-45, AC-63, AC-64, AC-65, AC-66, AC-67, AC-68, AC-69, AC-16, AC-10, EC-29, EC-38…EC-43, EC-49, NFR-6
- Files:
  - modify `.../OverviewTab/OverviewTab.tsx` and `OverviewTab.test.tsx`
  - modify `.../BriefCard/BriefCard.tsx`, `BriefCard.test.tsx` and `styles.ts`
  - create `.../BriefCard/_components/BriefBanner/{BriefBanner.tsx,index.ts}`
  - create `.../BriefCard/_components/BriefSkeleton/{BriefSkeleton.tsx,index.ts}`
  - create `.../BriefCard/_components/BriefEmpty/{BriefEmpty.tsx,index.ts}`
  - create `.../BriefCard/_components/BriefGrid/{BriefGrid.tsx,index.ts}`
  - modify `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` (pass `reviews={reviews}` into `OverviewTab`; no other change here)
- Change:
  - **`OverviewTab`:**
    - One `<section>`: `SectionLabel FileText` "PR Brief" (reuse an existing `brief.label` key) followed by `<BriefCard>`.
    - Remove the separate Intent and Blast sections.
    - Keep the PR description section below.
    - New props: `reviews`, `files` (for D), `onOpenFile`.
  - **`BriefCard` state machine** (container, with early returns):
    - `!prId || isLoading || (generate.isPending && !brief)` → `BriefSkeleton` only, with no banner and no actions.
    - A brief is shown, `generate.isPending` → `BriefBanner` (summary kept, spinner where the score is, refresh disabled) followed by `BriefSkeleton`. The skeleton replaces the grid, the focus block and the notes.
    - No brief:
      - an error → `ErrorState` with a retry action, in place of the empty card;
      - otherwise `BriefEmpty`;
      - then `BriefGrid` (Intent + Blast), per P-5.
    - A brief is shown:
      1. `BriefBanner`;
      2. the error row, `role="alert"` with Retry (`generate.isError ? regenerate : refetch`), directly below the banner (AC-8). The old brief stays;
      3. `BriefGrid`, with `risks` in the left card;
      4. `ReviewFocusBlock` (S9 builds the final one; S8 wires it);
      5. the AC-16 notes, in muted small text at the bottom: the removed-items note when `hasRemovedItems`, and "Generated without: …" when `missing` is non-empty. Treat missing risk-line counters as 0.
    - Keep the wrapping `aria-live="polite"` region. Replace the old `s.subTitle` headings.
  - **`BriefBanner`:**
    - Layout follows the design: left a verdict tile (only if a verdict review exists), a verdict label, and an "N findings · M blockers" badge using the existing `prReview.verdict.*` keys. The hint (i) is a keyboard-focusable control (`button type="button"` with `aria-label`, `title` and an associated description) whose text states the source split (AC-67).
    - Below those, the brief's `summary` as the main text at 13.5 px.
    - A right column holds a `RefreshCw` `IconBtn` (`aria-label` and tooltip "Re-run the brief for this PR", disabled while generating) and an "Outdated" text badge next to it when `data.stale` (AC-45).
    - Next to the refresh button, show the score `CircularScore` plus the "PR SCORE" label when the verdict review has a score. While generating, a spinner takes the score's place, or where it would be (AC-68).
    - Cost row: `RunCostBadge variant="detailed"` fed by `brief.usage.cost_usd`, `tokens_in` and `tokens_out`, with "—" when `cost_usd` is null (AC-65, Q-R2-1 A). Show it with or without a review.
    - With no verdict review, show no tile, label, badge or score, and no error (P-10).
    - Do not edit `VerdictBanner`.
  - **`BriefSkeleton`:** a 1fr/1fr grid of two `Card`s. Each has a title line at 40% width, four text lines, a divider and two text lines (AC-4).
  - **`BriefEmpty`:** a card with `minHeight: 320`, a 48×48 tile (`--bg-hover`, radius 12) holding `Icon.FileText`, the title "No brief yet", the text "Generate a Why+Risk brief for this PR.", and a primary "Generate brief" `Button` with the FileText icon.
  - **`BriefGrid`:**
    - Two equal columns (`1fr 1fr`, gap 16).
    - The left `Card` holds `<IntentCard>`; when a brief exists it adds a divider and then the Risk areas section: `SectionLabel AlertTriangle` "Risk areas" plus `RiskList`, or `noRisks` when empty.
    - The right column is `<BlastRadiusCard>`.
    - It takes `riskSlot`/children rather than importing BriefCard internals circularly. Props stay under 7.
  - The generate and refresh actions are disabled in the skeleton states and while a request is in flight.
- Skills & rules:
  - `react-architecture`:
    - "`page.tsx` composes; features implement";
    - "one component per folder with companions";
    - "no feature imports from `app/`";
    - "server data stays in the query cache, never copied to `useState`".
  - `react-best-practices`:
    - "derive, don't store": the verdict review, the counts and the stale flag are computed during render;
    - "PascalCase components only, no `renderX()`";
    - "early returns for loading/error/empty/success";
    - "components ≤ 200 lines and ≤ 5–7 props";
    - "`aria-label` on icon-only buttons";
    - "no `count && <X/>` with 0".
  - `next-best-practices` — "`'use client'` on the leaves".
  - `react-testing-library` — "assert visible strings and accessible names; `userEvent`; mock at the hook boundary (`usePrBrief`, `useGenerateBrief`, `usePrIntent`, `usePrBlast`)".
  - client INSIGHTS — "`textContent` matchers for 'N findings · M blockers'"; "gate on `!prId || isLoading`".
  - Colours and spacing from the design tokens already used (`var(--…)`), as in `VerdictBanner/styles.ts`.
- Tests (hermetic): update `BriefCard.test.tsx` and `OverviewTab.test.tsx`. Cases:
  - **Layout:**
    - the order banner → grid → focus → notes;
    - each heading exactly once ("PR Brief", "Intent", "Risk areas", "Blast radius", "Review focus — read these first"), with no "Summary";
    - the empty state shows "No brief yet" once, with the Intent "No intent yet" and Blast cards below, and no duplicated empty text;
    - `prId` going from null to resolved shows the skeleton first, never forever.
  - **Refresh and errors:**
    - refresh in flight keeps the summary, shows the spinner and a disabled refresh button, and shows the skeleton under the banner;
    - a failed refresh shows the old brief with the error row directly below the banner;
    - a load error with no brief replaces the empty card.
  - **Banner:**
    - the newest review without a verdict falls back to an older one with a verdict;
    - no review, or reviews undefined, gives a banner with no verdict and no error;
    - a missing score gives no score;
    - cost shows "—" when null;
    - the hint is reachable by role;
    - the refresh button is found by role and the name "Re-run the brief for this PR";
    - "Outdated" shows when stale.
  - **Notes:** a pre-revision-2 brief fixture (no risk `line`, no counters) and a fixture with `line: null` both render without error, and the notes follow AC-16.
- Acceptance: the Overview renders one PR Brief block in every state above, with no duplicate heading text, and the tests pass.
- Verify: `cd client && pnpm test -- BriefCard OverviewTab IntentCard BlastRadiusCard && pnpm typecheck`

### Phase C — risks + focus (G8–G12)

### S9 — Review focus block  [package: client] [depends on: S8]
- AC: AC-75, AC-13 (focus rows), AC-16 (focus empty state), EC-48, NFR-6, P-13, P-15
- Files: modify `.../BriefCard/_components/FocusList/FocusList.tsx` · create `.../BriefCard/_components/ReviewFocusBlock/{ReviewFocusBlock.tsx,index.ts}` · modify `.../BriefCard/styles.ts` · modify `.../BriefCard/BriefCard.test.tsx`
- Change:
  - `ReviewFocusBlock` is a full-width block (`--bg-elevated`, 1px border, radius 10, padding 14/16). The header holds the `ListChecks` icon in the accent colour via `SectionLabel`, the title, and a count badge only when items exist (P-15).
  - With no items it shows the `focusEmpty` text inside the block.
  - `FocusList` becomes an `<ol>`. Each `<li>` holds a full-width `<button type="button">` with:
    - a hover background (CSS `:hover` through a small class, or state-free inline style plus `onMouseEnter` kept minimal);
    - a decorative `<span aria-hidden="true">▸</span>` marker in the accent colour;
    - `file:line` in monospace on one line (11.5 px, `white-space: nowrap`, `overflow: hidden`, `text-overflow: ellipsis`, `min-width: 0`) with a `title` holding the full `file:line`;
    - "— reason" (12.5 px).
    - The button's accessible name is `file:line — reason`, so the full path is exposed. The row must not cause horizontal page scroll.
  - Keep the model order. Click → `onOpenFile(file, line)`.
- Skills & rules:
  - `react-best-practices` — "accessible names on icon-only controls", "index keys only for static lists" (use a `file:line:index` key as today).
  - `react-architecture` — "children get props, no data access".
  - `react-testing-library` — "`textContent` matcher for rows and badge".
- Tests (hermetic): focus tests in `BriefCard.test.tsx`. Cases:
  - ordered list;
  - the count badge via `textContent`;
  - a row named `file:line — reason`;
  - a click calls `onOpenFile(file, line)`;
  - a very long path keeps its full text in its title and accessible name;
  - no items gives the empty text and no badge;
  - the "▸" marker is `aria-hidden`.
- Acceptance: rows are keyboard-activatable `<button>`s inside an `<ol>`, with a header, count and empty state as specified.
- Verify: `cd client && pnpm test -- BriefCard && pnpm typecheck`

### S10 — Risk pills with icon per kind, line and single-open expand  [package: client] [depends on: S5, S8]
- AC: AC-13, AC-71, AC-72, AC-52 (risk targets), AC-74 (render without lines), EC-35, EC-36, EC-45, EC-50, EC-51, NFR-1, NFR-6
- Files: modify `.../BriefCard/_components/RiskList/RiskList.tsx` · create `.../BriefCard/_components/RiskPill/{RiskPill.tsx,index.ts}` (only if `RiskList` would exceed ~200 lines) · modify `.../BriefCard/styles.ts` · modify `.../BriefCard/BriefCard.test.tsx` (or a new `RiskList.test.tsx`)
- Change:
  - `RiskList` takes `BriefRiskRecord[]` and renders a wrapping row (flex, wrap, gap 8) of pills, plus the panel below the row. State: `open: number | null`.
  - **Pill, split in two parts:**
    - Main area: a `<button>` that is the navigation target. Content: a kind icon from `iconNameForKind(r.kind)` (`Icon[name]`), coloured by `SEVERITY_COLOR[r.severity]`, with the title (12 px, 600) and, below it, `file_refs[0]` in monospace (10.5 px, accent) followed by `:line` only when `r.line` is a number. When `line` is null or missing, only the file is shown (use `riskRef` from S5).
    - Expand control: a separate `<button aria-expanded aria-label="Why this is a risk">` with a `ChevronDown` icon. Activating the open pill's control closes it. Activating another pill closes the first.
  - **Severity** is conveyed as the icon colour AND as text. Use a visually hidden text node or `aria-label` on the main button including the severity word (e.g. "High: <title>"). Never colour alone. The open pill gets a border in its severity colour.
  - **Panel:** a plain-text `explanation`, with no HTML or Markdown interpretation (render as a text node only), and one link per `file_ref` (buttons with `aria-label` = `brief.riskFileAria`, monospace).
  - **Navigation:** the pill main area and the panel link for `file_refs[0]` call `onOpenFile(file_refs[0], r.line ?? null)`. Other panel links call `onOpenFile(file, null)` (the contract table).
  - A pre-revision-2 risk (no `line`, free-form `kind`) and a risk with `line: null` both render with no `:line`. The fallback icon is used for an unlisted kind.
  - **`kind` is never used** to build a style, class or link; only as a lookup key into the fixed map (NFR-1).
- Skills & rules:
  - `react-best-practices`:
    - "no inline functions passed to memoised children";
    - "`aria-expanded` and `aria-label` on icon buttons";
    - "stable keys".
  - `react-architecture` — "state at the lowest owner (`open` lives in `RiskList`)".
  - `react-testing-library` — "severity by role or accessible name or `getAllByText` (SVG `<title>` double match)".
  - `security` (routed for rendering model text): "model text as React text nodes only, no `dangerouslySetInnerHTML`, no Markdown component".
- Tests (hermetic). Cases:
  - the icon per kind, including `api-contract`, `Security` and `other` falling back to AlertTriangle (assert via an accessible hook, e.g. a `data-icon` attribute on the wrapper, or the icon's rendered title; pick one and use it consistently);
  - severity text is reachable;
  - `file:line` under the title when `line` is a number, and only the file when `line` is null or missing;
  - expanding one pill opens its panel and collapses another (single open), and `aria-expanded` flips;
  - activating the open pill's control closes it;
  - an explanation containing `<b>x</b>` and `**y**` is shown literally;
  - the pill main area calls `onOpenFile(ref0, line)`, and `onOpenFile(ref0, null)` for a null line; the first panel link passes the line; the second ref link passes null;
  - a pre-revision-2 record renders.
- Acceptance: risks are wrapping pills with single-open expansion and the specified targets; the tests pass.
- Verify: `cd client && pnpm test -- BriefCard && pnpm typecheck`

### Phase D — navigation (G14, G15)

### S11 — Not-in-diff notice on Overview  [package: client] [depends on: S6, S8]
- AC: AC-76, AC-52, AC-54, EC-26, EC-44, EC-50, NFR-5
- Files: modify `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` · modify `client/src/app/repos/[repoId]/pulls/[number]/page.test.tsx` · modify `.../DiffTab/DiffTab.tsx` (only if wording or key changes; the direct-link note stays)
- Change in `openFile(file, line)`:
  - Check `pr.files.some(f => f.path === file)` (the page already holds `pr.files`). If not found, call `notify.warn(tBrief("brief.notInDiff", { file }), { durationMs: 2600, key: "not-in-diff" })`. Do not call `navigate`, so the address and history are unchanged, and the tab stays Overview.
  - If found, behave as today: `push` with `tab=diff`, `file`, and `line` (deleted when null).
  - Use `useTranslations("brief")` in `page.tsx` for the message (AC-10).
  - Keep `DiffTab`'s `role="status"` not-in-diff note for a directly opened link (AC-54). It is unchanged.
- Skills & rules:
  - `react-architecture` — "`page.tsx` is glue; the check is a one-liner using already-loaded data".
  - `next-best-practices` — "`useRouter().push` for the history entry".
  - `security`:
    - "navigation targets come only from grounded paths and are URL-encoded" (`URLSearchParams` already encodes);
    - "the file name goes in a text node (toast message), never HTML".
- Tests (hermetic): `page.test.tsx`. Cases (fake timers where noted):
  - activating a target outside `pr.files` leaves `router.push` uncalled, shows "File not in this PR's diff: <file>", and the toast is gone at 2.6 s;
  - three repeat activations leave a single notice, and its timer restarts;
  - an in-diff target pushes `?tab=diff&file=…&line=…`;
  - a blast-only first ref shows the notice (EC-50).
- Acceptance: a not-in-diff target shows a warn notice for 2.6 s, with no URL or history change.
- Verify: `cd client && pnpm test -- page toast && pnpm typecheck`

### S12 — Files changed arrival: accent border, one-time highlight, smooth scroll  [package: client] [depends on: —]
- AC: AC-77, AC-78, AC-52, EC-27, EC-32, EC-46, EC-47, NFR-6, NFR-8
- Files:
  - modify `client/src/components/diff-viewer/FileCard/FileCard.tsx`
  - modify `client/src/components/diff-viewer/CodeLine/CodeLine.tsx`
  - modify `client/src/components/diff-viewer/styles.ts`
  - modify `client/src/components/diff-viewer/constants.ts` (add `TARGET_SCROLL_OFFSET = 148`, D-e)
  - create `client/src/components/diff-viewer/useReducedMotion.ts`
  - modify `client/src/app/globals.css` (add `@keyframes ddLinePulse`)
  - modify `client/src/components/diff-viewer/DiffViewer/DiffViewer.test.tsx` (extend)
- Change:
  - **FileCard accent border:** when `target` is set, give the card `border: 1px solid var(--accent)` (a `fileCardFor(isTarget)` style helper). Other cards are unchanged.
  - **Smooth scroll:** replace the mount effect's `scrollIntoView({ block: "center" })` with a scroll that ends fully visible below the sticky header and tabs. Set `scrollMarginTop` on the scroll target element to `TARGET_SCROLL_OFFSET`, then call `el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" })`. `reduced` comes from `useReducedMotion()` (`window.matchMedia("(prefers-reduced-motion: reduce)")`, guarded for jsdom, where `matchMedia` may be undefined). Still scroll to the card header when the line is not rendered (EC-32). Keep the mount-only, once-per-arrival behaviour.
  - **One-time highlight:** in `CodeLine`/`lineRowFor(kind, highlighted, reduced)`, stop using the permanent `outline`. For a highlighted line use `animation: ddLinePulse 1.7s ease-out 1` with `animation-fill-mode: none`, so it is gone before 2 s. The background fades from an accent tint to the row's own background.
    - Under reduced motion, use a static background tint with no animation, which stays while the target is current (P-9). This matters because the global reduced-motion rule in `vendor/ui/styles.css` shrinks all animation durations to 0.01 ms and would otherwise erase the highlight. The static style therefore must not rely on an animation.
  - **`@keyframes ddLinePulse`** goes in `client/src/app/globals.css`, next to `ddToastIn`. Do not edit the vendored `vendor/ui/styles.css`.
  - Without a target, nothing changes for other diff views (NFR-8).
- Skills & rules:
  - `react-best-practices`:
    - "effects only to sync with external systems (scroll/DOM) — the scroll stays in the mount effect";
    - "clean up listeners";
    - "extract static style objects to module level".
  - `react-architecture` — "shared `components/diff-viewer` must not import from `app/`; so it gets its own constant rather than importing `STICKY_TOP_OFFSET`. Add a comment pointing at the sticky header height".
  - `next-best-practices` — "`'use client'` stays on the leaf hook and components".
- Tests (hermetic, `DiffViewer.test.tsx` + `FileCard` coverage): mock `Element.prototype.scrollIntoView` and `window.matchMedia`. Cases:
  - the target card has the accent border and others do not;
  - `scrollIntoView` is called with `behavior: "smooth"`, and with `"auto"` under reduced motion;
  - the highlighted line carries the animation style, and under reduced motion a static style with no animation;
  - the line is not rendered → scroll falls back to the card;
  - with no target, no highlight, no border change and no scroll;
  - the pulse animation has a duration below 2 s (assert the style string).
  - Assert styles by `toHaveStyle` or the style attribute, not by snapshots.
- Acceptance: arrival shows the accent card border and a ≤1.7 s fade, scrolls smoothly clear of the sticky header, and degrades per AC-78.
- Verify: `cd client && pnpm test -- diff-viewer DiffViewer DiffTab && pnpm typecheck`

### S13 — Client-wide regression pass  [package: client] [depends on: S8–S12]
- AC: AC-1, AC-10, AC-45, AC-52, AC-54, NFR-7, NFR-8
- Files: modify only tests or strings that fail (`DiffTab.test.tsx`, `VerdictBanner.test.tsx` expected unchanged, `IntentCard.test.tsx`, `OverviewTab.test.tsx`, `page.test.tsx`); no new feature code.
- Change:
  - Run the whole client suite and fix only revision-2 fallout, such as renamed i18n strings or the moved headings.
  - Grep for orphaned i18n keys: `grep -rn "brief.summary\|intent.briefLabel\|brief.emptyTitle" client/src`.
  - Confirm `ReviewRunAccordion` and `FindingsTab` still render `VerdictBanner` unchanged.
- Skills & rules: `react-testing-library` — "update tests for the changed behaviour; don't weaken assertions".
- Tests: whole suite.
- Acceptance: `pnpm typecheck` and `pnpm test` are green.
- Verify: `cd client && pnpm typecheck && pnpm test`
- Note: the main session runs `cd client && pnpm build` afterwards; the verifier cannot.

### Final process step (main session, not an implementer) — AC-58, AC-60
- Commit the revised spec and this plan before the first revision-2 code commit (`git log` order check).
- After phase D, run `plan-verifier` on revision 2, then `cd client && pnpm build` and `cd server && pnpm build` (plan-verifier cannot run builds).
- Compare visually with `materials/5/images/hw-01…03`.
- Record the demo, and make sure the PR has the implementation description and the verifier report with no unmet requirement. No cross-model note is added for revision 2 (R2-3).

### AC coverage
| AC / NFR / EC | Step(s) |
|---|---|
| AC-1 | S8 |
| AC-4 | S8 |
| AC-5 | S8 |
| AC-8 | S8 |
| AC-10 | S5, S8, S11 |
| AC-13 | S9, S10 |
| AC-16 | S8, S9 |
| AC-37 | S2 |
| AC-41 | S1 |
| AC-45 | S8 |
| AC-51 | S2 |
| AC-52 | S10, S11, S12 |
| AC-54 | S11 (direct-link note unchanged), S12 |
| AC-58 | Final process step |
| AC-60 | Final process step |
| AC-63 | S7, S8 |
| AC-64 | S5, S7, S8 |
| AC-65 | S5, S8 |
| AC-66 | S5, S8 |
| AC-67 | S8 |
| AC-68 | S8 |
| AC-69 | S8 |
| AC-70 | S5, S7 |
| AC-71 | S5, S10 |
| AC-72 | S10 |
| AC-73 | S1, S3 |
| AC-74 | S1, S4, S10 |
| AC-75 | S9 |
| AC-76 | S6, S11 |
| AC-77 | S12 |
| AC-78 | S12 |
| EC-33, EC-34, EC-35 | S2 |
| EC-36 | S5, S10 |
| EC-37 | S1, S4 |
| EC-38…EC-43 | S5, S8 |
| EC-44 | S6, S11 |
| EC-45 | S10 |
| EC-46, EC-47 | S12 |
| EC-48 | S9 |
| EC-49 | S7, S8 |
| EC-50 | S10, S11 |
| EC-51 | S1, S2, S4, S10 |
| NFR-1 | S10 |
| NFR-4 | S3 |
| NFR-6 | S6, S8, S9, S10, S12 |
| NFR-7 | S5, S13 |
| NFR-8 | S7, S12, S13 |

AC-3, AC-9, AC-20, AC-22, AC-26…AC-36, AC-42, AC-43, AC-46 and AC-49 are revision-1 behaviour and are unchanged, so no revision-2 step covers them. S4 re-checks AC-42 and AC-43. Every changed or new AC from the brief (AC-1, 4, 5, 8, 10, 13, 16, 37, 41, 45, 51, 52, 54, 58, 60, new AC-63…AC-78) appears above. EC-15's revised wording (a risk `line` that is not a positive integer or null) is covered by the S1 contract tests. Every step cites at least one AC.

### Phase grouping (multi-agent, sequential)
| Phase | Steps | Package(s) | Gate before the next phase |
|---|---|---|---|
| A | S1, S2, S3, S4 | shared, server | `cd server && pnpm typecheck && pnpm test`; `diff` of the two `brief.ts` files is empty |
| B | S5, S6, S7, S8 | client | `cd client && pnpm typecheck && pnpm test` |
| C | S9, S10 | client | same |
| D | S11, S12, S13 | client | same, then the main session's `pnpm build` |

Deviation from the expected shape: `S6` (the toast extension) is built in phase B, not D, because it is independent and small, and S11 then depends on it. `S12` has no dependency on B/C and could run earlier, but the sequential order is kept for review clarity.

## 5. File inventory
Implementer boundary. Paths marked `create` do not exist yet.

**shared (both copies)**
- `server/src/vendor/shared/contracts/brief.ts`
- `client/src/vendor/shared/contracts/brief.ts`

**server**
- `server/src/modules/brief/domain.ts`
- `server/src/modules/brief/prompt.ts`
- `server/src/modules/brief/constants.ts` (only if `BRIEF_PROMPT_VERSION` is safe to bump)
- `server/test/contracts.test.ts`
- `server/test/brief-domain.test.ts`
- `server/test/brief-input.test.ts` (or the file that asserts `SYSTEM_PROMPT`)
- `server/test/brief-service.test.ts`
- `server/test/brief.it.test.ts` (or `brief.repository.it.test.ts`)

**client** (`P` = `client/src/app/repos/[repoId]/pulls/[number]`)
- `client/messages/en/brief.json`
- `client/src/lib/toast.tsx`
- create `client/src/lib/toast.test.tsx`
- `client/src/app/globals.css`
- `client/src/components/diff-viewer/FileCard/FileCard.tsx`
- `client/src/components/diff-viewer/CodeLine/CodeLine.tsx`
- `client/src/components/diff-viewer/styles.ts`
- `client/src/components/diff-viewer/constants.ts`
- create `client/src/components/diff-viewer/useReducedMotion.ts`
- `client/src/components/diff-viewer/DiffViewer/DiffViewer.test.tsx`
- `P/page.tsx`
- `P/page.test.tsx`
- `P/_components/OverviewTab/{OverviewTab.tsx,OverviewTab.test.tsx}`
- `P/_components/IntentCard/{IntentCard.tsx,IntentCard.test.tsx,styles.ts}`
- `P/_components/IntentCard/_components/IntentEmpty/IntentEmpty.tsx`
- `P/_components/BlastRadiusCard/{BlastRadiusCard.tsx,BlastRadiusCard.test.tsx}`
- `P/_components/DiffTab/DiffTab.tsx` (only if needed) and `DiffTab.test.tsx` (regression fixes only)
- `P/_components/BriefCard/{BriefCard.tsx,BriefCard.test.tsx,helpers.ts,styles.ts}`
- create `P/_components/BriefCard/helpers.test.ts`
- create `P/_components/BriefCard/_components/BriefBanner/{BriefBanner.tsx,index.ts}`
- create `P/_components/BriefCard/_components/BriefSkeleton/{BriefSkeleton.tsx,index.ts}`
- create `P/_components/BriefCard/_components/BriefEmpty/{BriefEmpty.tsx,index.ts}`
- create `P/_components/BriefCard/_components/BriefGrid/{BriefGrid.tsx,index.ts}`
- create `P/_components/BriefCard/_components/ReviewFocusBlock/{ReviewFocusBlock.tsx,index.ts}`
- create `P/_components/BriefCard/_components/RiskPill/{RiskPill.tsx,index.ts}` (only if needed)
- `P/_components/BriefCard/_components/RiskList/RiskList.tsx`
- `P/_components/BriefCard/_components/FocusList/FocusList.tsx`
- Read-only, not to be edited: `P/_components/VerdictBanner/**`, `P/_components/ReviewRunAccordion/**`.

Not to be touched: `server/clones/**`, `server/src/db/migrations/**`, lockfiles, `client/src/vendor/ui/**`, `reviewer-core/**`, `e2e/**`, and the LLM adapters (`server/src/adapters/llm/**`).

## 6. Verification (end-to-end)
- Contracts: `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` (empty output).
- Server: `cd server && pnpm typecheck && pnpm test`. Run `pnpm test` as well, because typecheck skips `server/test/**`. The `*.it.test.ts` files need Docker.
- Client: `cd client && pnpm typecheck && pnpm test`, then `pnpm build` (run by the main session).
- Manual (the demo script, `./scripts/dev.sh`):
  1. Open a PR Overview with no brief: one "PR Brief" block, an empty card (48 px tile, "No brief yet"), and the Intent ("No intent yet") and Blast cards below it.
  2. Generate: the skeleton, then the banner, the grid with pills, and the Review focus block. Compare with `materials/5/images/hw-01…02`.
  3. Expand a pill (single open), and click a risk with a line and a focus row. A risk with a null line shows only its file.
  4. Files changed: accent card border, a line highlight that fades within 2 s, smooth scroll clear of the sticky header (`hw-03`).
  5. Click a blast-only file: a warning notice for 2.6 s, still on Overview.
  6. Reload an older stored brief: it renders with no risk lines.
  7. Refresh while a brief exists: banner kept, spinner, skeleton below.
- No e2e flow (out of scope).

## 7. Risks & open questions
- → user: none.
- → spec-creator: none. Two earlier questions were answered by the user on 2026-10-11 and are now plan decisions: a fixed arrival-scroll offset constant of 148 (D-e), and the Intent heading only in Intent's ready state (D-f).
- → researcher: none. The strict structured-output question is resolved (R2-5): the model-output `line` is nullable and the strict-mode guard test in S1 protects it.
- Residual implementation risk (for the S1 implementer, not a question): if `zodResponseFormat` rejects `.extend` on a nullable key or an unrelated field, keep `BriefRiskOut` literal and build `BriefRiskRecord` by a plain `z.object` with the same key order, instead of `.extend`. The identical-copies rule still applies.
- Candidate INSIGHTS (do not write now; for the main session to consider after verification):
  - client: the global `prefers-reduced-motion` rule in `vendor/ui/styles.css` sets `animation-duration: 0.01ms !important`, so a keyframe-only highlight vanishes under reduced motion. A static style is needed (relevant to AC-78).
  - client: `toast.tsx` auto-dismisses at a hard-coded 4 s and has no per-toast duration, so a warn toast with a custom duration needs the additive option from S6.

## 8. Notes for reviewers
- **Architecture:**
  - Server: the risk-line snapping reuses one extracted `snapLine` helper in ring 1 (`domain.ts`), with no I/O. Confirm focus snapping behaviour did not change.
  - Contracts: the model-output schema and the stored-record schema are deliberately two schemas (D-d). Confirm no `.optional()` or `.nullish()` is reachable from `BriefModelOutput`.
  - Client:
    - `IntentCard` and `BlastRadiusCard` become embeddable. Check that their data logic is untouched.
    - `BriefBanner` is a separate component rather than a `VerdictBanner` change. Confirm `VerdictBanner` and its two other consumers are unchanged.
    - The shared `diff-viewer` gets its own scroll offset constant instead of importing from `app/`.
- **Security (routing: `security` applies to model-text rendering, and to the navigation and URL inputs):**
  - Risk titles, explanations, focus reasons and file names are model output. They must be rendered only as React text nodes, with no HTML, Markdown or `dangerouslySetInnerHTML` (NFR-1).
  - `kind` is used only as a key into a fixed icon map, with an exact match and an own-property check (no `"constructor"` or prototype hits).
  - Navigation targets are built with `URLSearchParams` (encoded), and only after the in-diff check. A file name in the notice is a text node.
  - The prompt change adds only trusted static text; the untrusted-block handling and the no-hunk-body guarantee (AC-28, AC-35) are not touched, and S3's budget test guards the 8 000-token cap.
  - No new endpoint, secret or shell/git use.

## Not found
- `docs/agent-prompts/` has no brief-specific prompt document (it covers reviewer agents only), so no doc update is planned there.
- No existing `IconBtn` prop contract or `Tooltip` primitive was read in detail; the S8 implementer must read `client/src/vendor/ui/primitives/IconBtn.tsx` and use a `title`/`aria-label` pair if there is no tooltip prop.
- The INSIGHTS files were not opened in this run; the entries applied are the ones the spec itself names.
- Everything else relevant was found.
