# HW L05 — PR Brief design alignment: delivery plan

## Context
The PR Brief shipped on `hw-l05-pr-brief` (commits `7b8fa67…390d398`) works and passed plan-verifier, but it does not look like the Lab 05 design. `docs/plans/pr-brief-design-gaps.md` lists 16 gaps (G1–G16). This run closes them with the same SDD pipeline as the first run: **spec-creator → implementation-planner → /run-plan → plan-verifier → /pr-self-review**. Agents write the spec revision and the plan. I relay their questions and check their output.

**Decisions made (2026-10-11):**
- Scope: **all of Part 1 and Part 2.**
  - Part 1: G1, G2, G3 (minimal), G4–G8, G10-A, G12–G15.
  - Part 2: G3 full VerdictBanner, G9 expandable risks, G11 a line on each risk, G10-B kind enum in the prompt.
  - G16 (Prior PRs) stays out.
- Spec: **amend `specs/2026-10-10-pr-brief.md` in place** with spec-creator (revision 2). No separate delta spec.
- No cross-model (codex) review this time.
- Execution: **multi-agent**, one implementer per phase, run sequentially. I check each report before the next phase starts.

**INSIGHTS to name to the agents** (checked in `client/INSIGHTS.md`, `server/INSIGHTS.md`, root):
- client: "RTL `getByText` can't see 'N label' when the count is wrapped". This applies to the focus count badge and the "N findings · M blockers" badge.
- client: "`getByText` sees an SVG `<title>` and its sibling label as two matches". This applies to severity text on pill icons.
- client: "duplicate top-level JSON keys" and "`next-intl` logs `MISSING_MESSAGE`". New `brief.json` keys go inside the existing nested objects. Tests assert visible strings.
- client: "disabled TanStack Query keeps `isPending: true`". This applies to the skeleton and banner branches.
- server: "fields the model must judge go after the fields it observes". The new risk `line` goes right after `file_refs`, before `explanation`.
- server: "shared copies have drifted". Run `diff` only on the two `brief.ts` copies.
- server: "`pnpm typecheck` skips `server/test/**`". Run vitest too.
- root: "plan-verifier cannot run `pnpm build`". I run it myself.

## Stage 0 — Prep (main session, after approval)
1. Save this plan to `docs/plans/pr-brief-design-alignment-orchestration-plan.md`.
2. Decode the design bundle so agents can read the sources.
   - Write a small node script in the scratchpad. It reads the `__bundler/manifest` of `materials/5/Lab 05/DevDigest Design (standalone).html` and writes `screen_pr_detail.jsx`, `findings.jsx` and `diff.jsx` to `materials/5/Lab 05/design-src/`.
   - That directory is gitignored through `materials`.
   - If decoding fails, agents fall back to the gaps doc plus the `hw-0{1,2,3}` screenshots.
3. Leave the unrelated working-tree changes (`.gitignore`, `reviewer-core/INSIGHTS.md`) unstaged. `pr-brief-design-gaps.md` is committed with the spec revision (Stage 2.4).

## Stage 1 — Spec revision (`spec-creator` → `specs/2026-10-10-pr-brief.md`, revision 2)
Inputs in the prompt:
- the current spec
- the gaps doc (as the requirements source)
- the decoded design sources and screenshots
- the decisions above
- the INSIGHTS list
- the seeds below, each marked as a seed so the agent owns the wording and AC-IDs

**ID rules:**
- Changed ACs keep their ID, with revised text.
- New ACs continue from AC-63.
- Retired IDs go to "Removed IDs" and are never reused.
- Add a "Revision 2 (2026-10-11)" line to Decisions and update Traceability.
- Status goes back to `draft` until you approve it.

Seeds (one per gap; the agent turns them into EARS):
- **Non-goals:** remove `VerdictBanner` and "expandable risk explanations". Prior-PR history stays a non-goal (G16).
- **Composition (G1, G2, G13):**
  - One PR Brief block: banner, then a 1fr/1fr grid (`[Intent + Risk areas] [Blast radius]`), then Review focus at full width, then the AC-16 notes.
  - Each heading appears once, with the design's icons.
  - Intent and Blast logic is unchanged.
- **Banner (G3 full, G4):**
  - The summary comes from the brief.
  - Verdict, score and "N findings · M blockers" come from the PR's latest review that has a verdict. With no review, the banner shows no verdict and no score.
  - Refresh is an icon button with an accessible name.
  - "Outdated" sits next to Refresh (AC-45).
  - While generating, a spinner replaces the score.
  - The error row with Retry sits right under the banner (AC-8).
  - **Open question for the spec:** does the banner show the brief's own cost and tokens or the review's? My recommendation is the brief's own `usage`.
- **Skeleton (G5):**
  - The skeleton has the shape of the grid.
  - During a refresh, the banner stays and shows a spinner while the body becomes a skeleton.
- **Empty states (G6, G7):**
  - Brief: icon tile, min-height 320, "No brief yet" / "Generate a Why+Risk brief for this PR."
  - Intent: its own texts, so two identical empty cards never appear.
- **Risk pills (G8, G9, G10):**
  - Pills wrap horizontally.
  - The icon is chosen by `kind` from a fixed set: security, db_migration, breaking_api, perf, deps, with a fallback.
  - Icon colour shows severity, and the severity is also available as text or accessible name (NFR-6).
  - Under the title: the first file ref, plus `:line` when one is present.
  - A chevron expands one pill at a time. The panel shows the explanation as plain text (AC-13) and all file refs as links. The open pill's border takes the severity colour.
- **Kind enum in the prompt (G10-B):** the prompt lists the allowed kinds (security, db_migration, breaking_api, perf, deps, other). The contract stays `z.string()`, and an unknown kind falls back to the default icon.
- **Line on each risk (G11):**
  - `BriefRiskOut` gets an optional `line`, which applies to `file_refs[0]` and is ordered right after `file_refs`.
  - Grounding snaps it in the same way as focus lines. When there is nothing to snap to, the line is dropped and the risk is kept.
  - New `BriefGrounding` counters must be optional or default to 0, so briefs already stored in `pr_brief` still parse. No migration.
- **Review focus (G12):**
  - A separate block: icon, "Review focus — read these first", and a count badge.
  - The list is ordered (`<ol>`).
  - Each row is a full-width button with a ▸ marker, a no-wrap `file:line` and "— reason".
- **Not in diff (G14):**
  - Clicking a target that is not in the diff stays on Overview and shows the toast "File not in this PR's diff: {file}" for about 2.6 s.
  - A directly opened `?tab=diff&file=…` link still shows the AC-54 note.
- **Arriving on Files changed (G15):** the target file card gets an accent border, the line is highlighted once and fades out over about 1.7 s, and the scroll is smooth with an offset for the sticky header.

**Review checklist** before I set the status to `approved` (only with your OK):
- every G-item maps to an AC
- no `[NEEDS CLARIFICATION]` remains
- the backward compatibility of stored briefs is stated
- AC-58 now also covers revision 2: the spec and plan are committed before code.

## Stage 2 — Plan (`implementation-planner` → `docs/plans/pr-brief-design-alignment-plan.md`)
1. **Pass 1:** I relay its questions. The execution mode answer is already **multi-agent, one implementer per phase**.
2. **Pass 2:** I save its output verbatim. Sanity-check that the phases roughly look like this:
   - **A — shared + server (G11, G10-B):**
     - `BriefRiskOut.line?` and the optional `BriefGrounding` counters, in both `brief.ts` copies
     - risk-line snapping in `server/src/modules/brief/domain.ts` (`groundBrief`), reusing the focus snap
     - in `prompt.ts`: drop "no line numbers" for risks, add the line rule and the kind list
     - before touching the prompt, read `docs/agent-prompts/README.md`
     - tests: `brief-domain`, `brief-input`/prompt, and a contracts test proving that an old stored record without `line` still parses
   - **B — client, block structure (G1–G7, G13):**
     - `OverviewTab` becomes a single section
     - `BriefCard` composes the banner, the grid and the focus block, and moves the notes and error row
     - reuse `…/_components/VerdictBanner` (allowing a missing verdict or score, or adding a thin brief-banner wrapper), fed with the latest review from the `usePrReviews` data that `page.tsx` already holds
     - `IconBtn` and `SectionLabel` from `@devdigest/ui`
     - the grid skeleton, the empty state, and the `brief.json` and `intent.*` texts
   - **C — client, risks and focus (G8–G12):**
     - `RiskList` becomes pills, with the `kind → icon` map, the expand state, and the `file:line` display
     - `FocusList` becomes the separate block
   - **D — client, navigation (G14, G15):**
     - `openFile` in `page.tsx` checks the PR file list and calls `notify` from `client/src/lib/toast.tsx`
     - in `components/diff-viewer/{FileCard,CodeLine,styles}`: card border, `@keyframes` fade in the global styles, smooth scroll with an offset
3. **Push back** if the plan proposes a DB migration, changes to reviewer-core, provider adapters or how Intent/Blast compute, an e2e flow, or Prior PRs.
4. **Commit gate (on your go):** `docs(pr-brief): spec revision 2 and design-alignment plan`. It includes the spec, the plan, the gaps doc and the orchestration plan, and lands **before any code** (AC-58).

## Stage 3 — Code (`/run-plan docs/plans/pr-brief-design-alignment-plan.md`)
- You invoke `/run-plan`. It runs one implementer per phase (A → D), then architecture-reviewer, a fix loop (at most 2 rounds), test-writer (limited, tests derived from ACs) and plan-verifier.
- I check every phase report before the next phase starts. On your go, each phase gets its own commit: `feat(shared,server)`, `feat(client)` ×3, `test(...)`.
- Guard rails:
  - no edits in `server/clones/**`, migrations or lockfiles
  - pnpm in `server/` and `client/`
  - the two `brief.ts` copies stay identical

## Stage 4 — Verify and wrap up
1. Save the plan-verifier report to `docs/plans/pr-brief-design-alignment-verification.md`. It needs zero NOT MET rows.
2. I run `cd client && pnpm build` myself, because plan-verifier cannot.
3. Visual check on `./scripts/dev.sh` (`run` skill or Chrome), on the test PR, against `hw-01…03`:
   - generate the brief: the banner shows the verdict when a review exists, the grid, the pills (expand one) and the focus block
   - click a focus item: the card border, the line fade and the smooth scroll
   - click a blast-only file: the toast, and the tab stays on Overview
   - reload: the brief shows instantly
   - a real LLM run returns `kind` values from the enum and risk lines inside changed ranges
4. `engineering-insights` sweep. Then `doc-writer` updates `server/docs/` and `client/` brief docs, only where they already describe the brief.
5. `/pr-self-review`. Its PASS gate unblocks `git push` and `gh pr create`.

## Verification commands
- `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` → no output
- `cd server && pnpm typecheck && pnpm exec vitest run test/contracts.test.ts test/brief-*.test.ts test/brief*.it.test.ts && pnpm test`
- `cd client && pnpm typecheck && pnpm test && pnpm build`
- Tests expected to change or be added:
  - `BriefCard.test.tsx`: banner, icon Refresh with an accessible name, pills, expand, empty state
  - `OverviewTab.test.tsx`: single section
  - `IntentCard.test.tsx`: new empty texts
  - `page.test.tsx`: toast and no tab switch for a file not in the diff
  - `DiffTab.test.tsx` / `FileCard` tests: target border
  - server: `brief-domain` (risk-line snap and drop), prompt kinds, old-record parse
