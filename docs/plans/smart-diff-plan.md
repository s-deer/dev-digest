# Development Plan: Smart Diff

## Context
Homework `tasks/smart-diff/homework.md` (L03). Today the **Files changed** tab lists files in GitHub order, and the agent's findings live only on the Agent runs tab. Smart Diff does two things:
1. Groups the PR's files by role, in the order `core → tests → wiring → docs → boilerplate`.
2. Shows the latest review's findings inside the diff: a counter on each group header, a dot on each file card, and an inline comment under the line.

**Decided with the user:**
- Scope is P1 + P2 + P3.
- Findings come from the **latest `kind='review'` review, with dismissed findings hidden**.
- Work stays on **`feat/module-l03`**.
- After the last phase: architecture-reviewer ∥ plan-verifier, then the e2e flow 05 update, doc-writer, and an INSIGHTS sweep.

**How it runs:**
- After approval, the main session writes this plan to `docs/plans/smart-diff-plan.md` (the saved preference).
- The plan uses the planner's S-step format (Files / Change / Skills / Tests / Acceptance / Verify), so implementer and plan-verifier can read it.
- Each **Phase** goes to its own `implementer` agent, one after another. The main session checks each phase's report before starting the next.

**INSIGHTS that apply:**
- `server/INSIGHTS.md`: the two vendored contract copies have drifted, so port only the targeted diff and never copy a whole file. `pnpm typecheck` does not cover `server/test/**`, so tests must actually run.
- `client/INSIGHTS.md`: tests render with the real `messages/en/*.json` in `NextIntlClientProvider`. Duplicate JSON keys silently drop messages. A query disabled on a null key stays `isPending`.
- Root `INSIGHTS.md`: self-review uses `--base HEAD`.

## Key design decisions
- **Server module `server/src/modules/smart-diff/`** follows the `modules/intent/` layout, minus the LLM and DB migrations:
  - `constants.ts` holds `ROLE_ORDER` and `CLASSIFICATION_RULES`. The rules are an ordered array, checked boilerplate → tests → wiring → docs, and the first match wins; `core` is the fallback.
  - `classify.ts` holds a pure `classifyFile(path)`. It imports nothing but constants and the shared type, so L08 can import it without an HTTP request.
  - `domain.ts` holds a pure `buildSmartDiff(files, findings)`:
    - groups in `ROLE_ORDER`, with **empty groups omitted**;
    - GitHub order kept inside each group;
    - `finding_lines` = the sorted, unique `start_line` values for that file;
    - `split_suggestion = { too_big:false, total_lines:Σ(add+del), proposed_splits:[] }`.
  - `repository.ts` (Drizzle) implements `SmartDiffSourcePort` with a single workspace-scoped method, `loadInputs(workspaceId, prId) → { files, findings } | undefined`:
    - it returns `undefined` when the PR is not in the workspace;
    - findings come from the newest `kind='review'` review, ordered by `createdAt desc, id desc`, and only those where `dismissedAt IS NULL`;
    - *(Revised after architecture-reviewer A1: the first draft had three unscoped methods.)*
  - `service.ts` defines `SmartDiffService`, which takes only that port. It throws `NotFoundError` if the PR is missing.
  - `routes.ts` serves `GET /pulls/:id/smart-diff` with `schema: { params: IdParams, response: { 200: SmartDiffResponse } }`. It logs `smart-diff: built` (file and group counts, `llm:false`) to back up the "no model call" claim.
  - Wiring: lazy getters in `platform/container.ts` and one entry in `modules/index.ts`.
- **The classifier uses hand-written RegExps in `constants.ts`,** not glob strings, so no new dependency is needed. Each rule carries a readable `label` for tests.
  - Decision to pin in the test table: `e2e/README.md` → `tests`, the starter default.
- **Where the client gets its data:**
  - Roles, order, group counters and file dots come from the route's `finding_lines`.
  - Inline finding cards come from `usePrReviews`, using the latest `kind==='review'` review with dismissed findings removed. A pure helper does this; it follows the same rule as the server.
  - `smartDiffKey` is invalidated in `page.tsx` `onRunDone` and in `useFindingAction` `onSuccess`, so counters refresh after Run review and after Accept/Dismiss without a reload.
  - `useSmartDiff` only turns on after `usePullDetail` succeeds. `GET /pulls/:id` refreshes `pr_files` before it responds, which avoids a race on first load.
- **How the diff viewer changes** (`client/src/components/diff-viewer`, shared, so it must not import from `app/`):
  - `DiffViewer` uses `key={f.path}` instead of the array index.
  - It gains an optional `findings?: DiffFindingsApi` prop, passed down to `FileCard` and `CodeLine` alongside `commenting`. The type is `{ byPath: Map<string, FindingRecord[]>; filesWithFindings?: Set<string>; show: boolean; onAction(id, action); pending }`.
  - New `diff-viewer/FindingComment/`: a simpler copy of `FindingCard`. It shows `SeverityBadge`, the title, the markdown rationale, the suggestion, Accept/Dismiss buttons, and can collapse to a single line (P3).
  - `CodeLine` gets a coloured left stripe and a right-side label for the line's most severe finding: `CRITICAL→blocker`, `WARNING→warning`, `SUGGESTION→suggestion`. Colours come from `SEV` (`vendor/ui/primitives/tokens.ts`).
  - A finding matches a line when the line's key from `keysForLine` equals `RIGHT:${start_line}`. Findings that match no line go into a "Findings outside the diff" block at the end of the file, styled like `OutdatedComments`.
  - `FileCard` shows the findings dot next to the path. The existing comment counter with the message icon is a separate mark.
- **One Show/Hide toggle for both GitHub comments and finding comments.** It shows whenever there are comments or findings, and it now **defaults to shown**, so P1's "finding visible under the line" works without a click. This changes the old default, which was hidden; the reason goes in the PR notes.
- **Smart order UI** lives in the `DiffTab` feature folder (`DiffTab/_components/…`):
  - `OrderToggle`: Smart order / Original order, built from `Button` with `active`, state in `DiffTab`.
  - `SmartDiffGroups` and `GroupHeader`:
    - the header has a chevron, a colour square, the label, a hint, `● N` (files with findings) and "N files";
    - `docs` and `boilerplate` start collapsed; the other groups are open, and files inside follow `AUTO_EXPAND_MAX_LINES`;
    - the header is `position: sticky` (P3).
  - Original order renders `pr.files` exactly as it does today, still with inline findings.
  - If smart-diff fails or is still loading, the tab falls back to original order.
  - Before the first review, a "Review hasn't been run yet" hint replaces zero counters (P3).
  - All strings come from `prReview.json` → `smartDiff` (P3).

---

## Phase 1 — Contracts + i18n  (implementer #1)
**S1 [shared] — Extend `SmartDiffRole` to 5 values.**
- **Files:** modify `server/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/brief.ts`, with an identical targeted edit on line 131: `z.enum(['core','tests','wiring','docs','boilerplate'])`. Update `server/test/contracts.test.ts` to add a case that parses the `tests` and `docs` roles.
- **Skills:** `zod`.
- **Acceptance:** both `brief.ts` files diff clean against each other; both packages typecheck.
- **Verify:** `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts`; `cd server && pnpm typecheck && pnpm exec vitest run test/contracts.test.ts`; `cd client && pnpm typecheck`.

**S2 [client] — i18n keys.**
- **Files:** `client/messages/en/prReview.json`.
- **Change:** add these keys under `smartDiff`:
  - `testsLabel`, `docsLabel`;
  - role hints `coreHint … boilerplateHint`;
  - `smartOrder`, `originalOrder`, `reviewerOrdered`, `summaryLine` (`{files} files · +{add} −{del}`);
  - `filesWithFindings`, `noReviewYet`, `findingsOutsideDiff`;
  - `lineLabel.{CRITICAL,WARNING,SUGGESTION}` = `blocker` / `warning` / `suggestion`;
  - `showComments`, `hideComments`, `collapseFinding`, `expandFinding`.

  Check there are no duplicate top-level keys.
- **Acceptance:** the JSON parses and `cd client && pnpm test` stays green.

## Phase 2 — Server Smart Diff module  (implementer #2)
**S3 [server] — Classifier with a test table written first.**
- **Files:** create `server/src/modules/smart-diff/constants.ts`, `classify.ts`, `server/test/smart-diff-classify.test.ts`.
- **Change:** `ROLE_ORDER`, and `CLASSIFICATION_RULES` in the check order from the homework table. `classifyFile(path)` normalises `\` to `/` and returns the first match, or `core`.
- **Tests:** an `it.each` "path → role" table that covers:
  - every pattern;
  - the three disputed cases: `src/__tests__/__snapshots__/x.snap`→boilerplate, `.claude/skills/security/SKILL.md`→wiring, `e2e/README.md`→tests;
  - plus `pnpm-lock.yaml`→boilerplate, `server/src/modules/x/index.ts`→wiring, `docs/a.md`→docs, `server/src/modules/reviews/service.ts`→core.
- **Skills:** `onion-architecture` — "domain is pure, no framework imports".
- **Verify:** `cd server && pnpm exec vitest run test/smart-diff-classify.test.ts`.

**S4 [server] — Pure `buildSmartDiff`.**
- **Files:** create `server/src/modules/smart-diff/domain.ts`, `server/test/smart-diff-domain.test.ts`.
- **Tests:**
  - groups come out in role order and empty groups are omitted;
  - files inside a group keep their input order;
  - `finding_lines` are unique and sorted, and only belong to the matching file;
  - `total_lines` is the sum;
  - the output passes `SmartDiff.parse`.

**S5 [server] — Repository, service, route and wiring.**
- **Files:** create `smart-diff/repository.ts`, `service.ts`, `routes.ts`; modify `server/src/platform/container.ts` (the `smartDiffRepo` and `smartDiffService` getters) and `server/src/modules/index.ts`; create `server/test/smart-diff-service.test.ts` (fake port, hermetic) and `server/test/smart-diff.it.test.ts`.
- **Change:** the design above. The repository copies the "latest review" query style from `reviews/repository/review.repo.ts` / `pulls/routes.ts:118-135`, filtered to `kind='review'`, ordered `desc(createdAt)`, limit 1, and `isNull(findings.dismissedAt)`.
- **Tests:**
  - service: 404 for an unknown PR; with no review, groups still come back and every `finding_lines` is `[]`.
  - `.it` on seeded PR #482 (the `test/intent.it.test.ts` pattern): 200, `SmartDiff.safeParse` succeeds, `src/config.ts` has `finding_lines` containing 12, and a dismissed finding is excluded.
- **Skills:** `onion-architecture` (port in the service, Drizzle only in the repository, narrow dependencies in the container); `fastify-best-practices` + `security` (routes, Zod params/response, workspace scoping via `getContext`); `drizzle-orm-patterns` (repository).
- **Verify:** `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run smart-diff.it` (Docker; SKIPPED if unavailable).

## Phase 3 — Client data + findings in the diff  (implementer #3)
When this phase is done, **Original order** already shows inline findings, dots and Accept/Dismiss.

**S6 [client] — Hook and invalidation.**
- **Files:** create `client/src/lib/hooks/smart-diff.ts` (`smartDiffKey`, `useSmartDiff(prId, enabled)`, modelled on `hooks/intent.ts`); modify `client/src/lib/hooks/reviews.ts` (`useFindingAction` `onSuccess` also invalidates `smartDiffKey(prId)`); modify `page.tsx` (`onRunDone` invalidates `smartDiffKey`).
- **Skills:** `react-architecture` (data goes through `lib/hooks` → `api.ts`), `react-best-practices`.

**S7 [client] — Findings helper.**
- **Files:** create `DiffTab/helpers.ts` + `helpers.test.ts`.
- **Change:** `latestReviewFindings(reviews)` returns the newest `kind==='review'` review's findings with dismissed ones removed. `findingsByPath(findings)` returns a `Map`. The implementer confirms the `ReviewRecord` field names in `review-api.ts`.

**S8 [client] — Diff-viewer findings support.**
- **Files:**
  - modify `components/diff-viewer/{comments.ts (DiffFindingsApi type), DiffViewer, FileCard, CodeLine, styles.ts, index.ts}`;
  - create `components/diff-viewer/FindingComment/{FindingComment.tsx,index.ts,FindingComment.test.tsx}` and `components/diff-viewer/OutsideFindings/`;
  - add a `diff-viewer/findings.ts` helper (`findingsForLine`, `partitionFindings`, `topSeverity`) + test.
- **Change:** everything under "How the diff viewer changes" above. Keys become `key={f.path}`.
- **Tests:**
  - an inline card renders under line `RIGHT:n`;
  - the stripe and label show the top severity;
  - an unanchored finding appears in the end-of-file block;
  - Accept calls `onAction`;
  - `show:false` hides the cards;
  - the dot appears only for files with findings, separate from the comment counter.
- **Skills:** `react-architecture` (`components/` never imports `app/`), `react-best-practices`, `react-testing-library` (`fireEvent`, real messages for `shell` + `prReview`).

**S9 [client] — Wire DiffTab (original order).**
- **Files:** modify `DiffTab/DiffTab.tsx`; create `DiffTab/DiffTab.test.tsx`.
- **Change:**
  - `DiffTab` calls `usePrReviews(prId)` and `useFindingAction()`, builds `DiffFindingsApi`, and passes it to `DiffViewer`.
  - The single Show/Hide toggle covers both comments and findings, defaults to shown, and uses i18n strings.
- **Tests:** mock `@/lib/hooks/reviews` with `vi.hoisted`. A finding renders inline, and the toggle hides it.
- **Verify:** `cd client && pnpm typecheck && pnpm test`.

## Phase 4 — Smart order UI  (implementer #4)
**S10 [client] — Groups, toggle, counters.**
- **Files:**
  - create `DiffTab/_components/OrderToggle/`, `DiffTab/_components/SmartDiffGroups/` (including `_components/GroupHeader/`), `DiffTab/constants.ts` (role colours/tokens, `COLLAPSED_BY_DEFAULT = ['docs','boilerplate']`);
  - modify `DiffTab.tsx` (toggle state, `useSmartDiff` enabled once `files` has loaded, fallback to original order);
  - modify `page.tsx` only if `DiffTab` needs `prDetail` loaded or success props.
- **Change:**
  - Map each smart-diff group's paths back to the `PrFile` objects (which carry the patches). Any `PrFile` missing from the response goes into `core`, to be safe.
  - `GroupHeader`: a sticky header with label, hint, `● N` (only when N > 0), "N files", and the collapse chevron.
  - Before any review exists, a `noReviewYet` hint shows in the toolbar.
  - A reviewer-ordered summary line and `OrderToggle` sit in the toolbar.
- **Tests:**
  - groups render in role order with their labels;
  - docs and boilerplate are collapsed and the lock file is inside boilerplate;
  - the header counter counts files, not findings (2 files with 5 findings shows 2);
  - the toggle switches to original order;
  - with no review, the empty hint shows.
- **Skills:** `react-architecture` (colocated `_components/<Name>/`), `react-best-practices`, `react-testing-library`, `next-best-practices` ('use client').
- **Verify:** `cd client && pnpm typecheck && pnpm test && pnpm build`.

## Phase 5 — e2e, review, docs  (implementer #5 → reviewers → doc-writer)
**S11 [e2e]**
- **Files:** modify `e2e/specs/05-pr-diff.flow.json`.
- **Change:** after opening Files changed on PR #482, wait for "Smart order" and "Core" and check the seeded file is still visible. Keep the flow read-only (see `e2e/docs/writing-a-flow.md`).
- **Verify:** `cd e2e && npm run e2e:hermetic`.

**Review:** run `architecture-reviewer` ∥ `plan-verifier` against `docs/plans/smart-diff-plan.md`, then fix any CHANGES REQUESTED or NOT MET items with a follow-up implementer pass.

**Docs:**
- `doc-writer` creates `server/docs/smart-diff.md` (with a mermaid diagram), adds the route to the `server/README.md` API map and its index in `server/docs/README.md`, and adds the new query key and invalidations to `client/docs/data-flow.md`.
- The `engineering-insights` sweep follows.

## File inventory
- **shared:** both `contracts/brief.ts`.
- **server:** `src/modules/smart-diff/*`, `src/platform/container.ts`, `src/modules/index.ts`, `test/contracts.test.ts`, `test/smart-diff-*.test.ts`, `test/smart-diff.it.test.ts`.
- **client:**
  - `messages/en/prReview.json`, `src/lib/hooks/{smart-diff,reviews}.ts`;
  - `src/components/diff-viewer/**`;
  - `src/app/repos/[repoId]/pulls/[number]/{page.tsx,_components/DiffTab/**}`.
- **e2e:** `specs/05-pr-diff.flow.json`.
- **docs** (Phase 5 only): `server/docs/smart-diff.md`, `server/docs/README.md`, `server/README.md`, `client/docs/data-flow.md`, `*/INSIGHTS.md`, `docs/plans/smart-diff-plan.md`.

## Out of scope
- No LLM call and no `pseudocode_summary`.
- No real split suggestions.
- No DB migration.
- The Agent runs tab is unchanged.
- No commits, pushes or PR creation by agents; the user does these.

## Verification (end-to-end)
- `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test`
- `cd client && pnpm typecheck && pnpm test && pnpm build`
- `cd e2e && npm run e2e:hermetic`
- **Manual demo** (the user prepares a test PR in the fork with a lock file, a core change, a test and a config/barrel file):
  1. `./scripts/dev.sh`, open the PR → Files changed. Five groups appear, with docs and boilerplate collapsed.
  2. Open boilerplate: `pnpm-lock.yaml` is there.
  3. Run review, then return: `● N` shows on the group header and a dot on the file card.
  4. Expand a file: the inline card, stripe and label are there, and Accept/Dismiss update the counters.
  5. Toggle to Original order and back.
  6. The server log shows `smart-diff: built … llm:false`.
