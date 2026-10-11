# PR Brief: gaps between the implementation and the design

- **Date:** 2026-10-10
- **Branch:** `hw-l05-pr-brief`, compared against the state after commit `4db5b6a`.
- **Design:** `materials/5/Lab 05/DevDigest Design (standalone).html`. This is a bundled build; the PR Brief screen is described in three of its modules:
  - `screen_pr_detail.jsx`: `OverviewTab`, `BriefCard`, `BriefEmpty`, `BriefSkeleton`, `RiskPillRow`, `ReviewFocusBlock`, `HistoryAccordion`, `NavToast`, `ScreenPRDetail.goto`;
  - `findings.jsx`: `VerdictBanner`;
  - `diff.jsx`: `DiffFileCard` (navigation to Files changed from a link in the brief).
- **Screenshots:** `materials/5/images/hw-01-pr-brief-overview.jpg`, `hw-02-pr-brief-risk-review-focus-annotated.jpg`, `hw-03-files-changed-after-click.jpg`.
- **Code:** `client/src/app/repos/[repoId]/pulls/[number]/_components/` (shortened below to `…/_components/`): `BriefCard/**`, `OverviewTab/OverviewTab.tsx`, `IntentCard/**`, `DiffTab/DiffTab.tsx`, plus `client/src/components/diff-viewer/{FileCard,CodeLine,styles}`.

## 1. What the screen looks like in the design

```
PR BRIEF (SectionLabel, FileText icon)
┌──────────────────────────────────────────────────────────────────────────┐
│ VerdictBanner: [⊗] Request changes  [6 findings · 2 blockers] (i)   ↻  (61) │
│               brief summary (text)                                 PR SCORE│
│                                                              $0.014 8.2K→1.3K│
└──────────────────────────────────────────────────────────────────────────┘
┌──────────── Card ─────────────┐ ┌──────────── Card ──────────────┐
│ ◎ INTENT                      │ │ ⑂ BLAST RADIUS                 │
│ "intent…"  IN SCOPE/OUT SCOPE │ │ symbols · callers · endpoints  │
│ ───────────────────────────── │ │ tree / graph                   │
│ ⚠ RISK AREAS                  │ │ ────────────────────────────── │
│ [🛡 Auth surface touched  ⌄]   │ │ Prior PRs touching these files ⌄│
│ [  file:12-18             ]   │ │                                │
│ [📦 New dependency …      ⌄]   │ │                                │
└───────────────────────────────┘ └────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────┐
│ ☰ REVIEW FOCUS — READ THESE FIRST  [4]                                    │
│ ▸ src/config.ts:12 — live Stripe key committed in plaintext                │
│ ▸ src/api/public/webhooks.ts:61 — …                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

Everything shown above is **one** PR Brief block. The summary sits in the banner. Intent and Risk areas are in the left card, Blast radius and Prior PRs in the right one. Review focus is a separate full-width block below them.

## 2. What the screen looks like now

```
PR BRIEF
┌ Card ─────────────────────────────────────────┐
│ [Outdated]                         [↻ Refresh] │
│ SUMMARY  / text                                │
│ RISK AREAS / vertical list: title,             │
│   "⚠ High", explanation, file links            │
│ REVIEW FOCUS / list of file:line — reason      │
│ removed / generated without notes              │
└───────────────────────────────────────────────┘
INTENT                      ← separate section
┌ Card: INTENT (heading repeated) … ┐
BLAST RADIUS                ← separate section
┌ Card … ┐
```

## 3. Differences and what to fix

"Priority" column: **P1 and P2** are the homework acceptance criteria; **P3** are optional items; **Design** means visual conformance only. The "Layer" column shows which packages have to change.

| ID | Area | Design | Now | What to fix | Priority | Layer |
|---|---|---|---|---|---|---|
| G1 | Overview composition | One PR Brief block: banner, a 1fr/1fr grid of two cards, Review focus below it (`BriefCard` in `screen_pr_detail.jsx`) | Three sections stacked: PR Brief (summary, risks, focus), then Intent, then Blast (`OverviewTab.tsx:25-38`) | Restructure: `OverviewTab` renders a single PR Brief section, and `BriefCard` composes the banner, the `[IntentCard + Risk areas] [BlastRadiusCard]` grid and `ReviewFocusBlock`. Intent and Blast come from the existing components with no change to their logic | Design (the homework says "put them side by side") | client |
| G2 | Intent heading appears twice | The "Intent" label is only inside the card | An outer `SectionLabel` "Intent" (`OverviewTab.tsx:31`) and another one inside `IntentCard` (`IntentCard.tsx:32`) | After G1 the outer heading goes away on its own. If G1 is not done, remove the outer `SectionLabel` in `OverviewTab.tsx:31` | Design | client |
| G3 | Summary | The summary text sits in `VerdictBanner` together with the verdict, the "N findings · M blockers" badge, an (i) hint about the data source, PR score and cost. Verdict and score come from the latest review, while "what / why / risks / review-focus" come from the brief | A "SUMMARY" subheading and a paragraph in the card (`BriefCard.tsx:94-97`), no banner | **Minimum:** a banner row with the summary (large 13.5px text) and a ↻ button on the right. **Full (P3):** take the existing `…/_components/VerdictBanner` with the PR's latest review data (as in `ReviewRunAccordion.tsx:140-150`), but pass `brief.summary` as `summary`. If there was no review, show the banner without verdict and score | Summary already exists (P1). Banner is P3, previously excluded by a scope decision | client |
| G4 | Refresh button | A ↻ icon (`IconBtn`, tooltip "Re-run the brief for this PR") in the banner. While generating, a spinner replaces the score circle | A secondary text button "Refresh" in the card header (`BriefCard.tsx:80-84`) | Replace with an `IconBtn` using the `RefreshCw` icon and an i18n `aria-label` inside the banner. Put the "Outdated" badge next to the button: the design doesn't have it, but AC-45 requires it | Design (refresh is P1, already works) | client |
| G5 | Skeleton while loading and generating | The banner stays (with a spinner); below it a skeleton of two cards in a 1fr/1fr grid: a 40% line, four lines, a divider, two lines (`BriefSkeleton`) | One card of four lines. During generation it also contains a disabled button (`BriefCard.tsx:32-48`) | The skeleton mirrors the G1 grid. During Refresh don't hide the old brief: banner with spinner, body as skeleton, as in the design | Design (P3: "skeleton") | client |
| G6 | Empty state | Card with `minHeight: 320`, a 48×48 tile (`bg-hover`, radius 12) with a `FileText` icon, title **"No brief yet"**, text **"Generate a Why+Risk brief for this PR."**, primary button "Generate brief" with a `FileText` icon | `minHeight: 220`, no icon tile. Title "No PR brief yet", text "Summarise what this PR changes…" (`BriefCard.tsx:54-64`, `styles.ts:46-54`, `brief.json` `brief.emptyTitle/emptyBody`) | Add the icon tile and `minHeight: 320`. Align `brief.emptyTitle` and `brief.emptyBody` texts with the design | Design | client (i18n) |
| G7 | Two identical empty states | There is one empty state, the brief's | `IntentEmpty` shows the same texts "No brief yet" / "Generate a Why+Risk brief for this PR." (`brief.json` `intent.emptyTitle/emptyBody`) with a "Derive intent" button. Two nearly identical cards appear on screen | Give Intent its own texts, e.g. "No intent yet" / "Derive the PR intent from its title, body and linked issue.". The `IntentCard.test.tsx` test only checks the button, so a small fix is enough | Design, confuses the user | client (i18n) |
| G8 | Risk areas: appearance | Horizontal wrapping "pills" (`RiskPillRow`). A pill is a button with an icon (color = severity), a title (12px, 600) and below it a monospace `file_refs[0]` link (10.5px, accent), plus a ⌄ button to expand | Vertical list: title, "⚠ High" as text, explanation always visible, file links (`RiskList.tsx:23-50`) | Rewrite `RiskList` as pills. Show severity via icon color, and keep the severity text for accessibility (NFR-6) via `title`/`aria-label` or visually hidden text | Design. The homework says: "icon color = severity" | client |
| G9 | Risk areas: expanding | ⌄ expands a panel below the row with the `explanation` (lightweight markdown) and links to all `file_refs`. One pill open at a time, border in the severity color | Explanation is always visible, no expanding | Add `open: number \| null` state and an expansion panel. Render model text as plain text, no HTML (AC-13) | P3, previously excluded by a scope decision | client |
| G10 | Icon per risk kind | `kind` from a fixed set: `security`→Shield, `db_migration`→Database, `breaking_api`→AlertOctagon, `perf`→Zap, `deps`→Boxes | `kind` is a free-form string: the prompt asks for a "short label such as "api-contract"" (`server/src/modules/brief/prompt.ts:16`). The UI doesn't use `kind`; every risk gets the AlertTriangle icon | Option A (client only): a `kind → icon` map with AlertTriangle as fallback. Option B: list the allowed `kind` values in the prompt (security, db_migration, breaking_api, perf, deps, other), leave the `z.string()` contract untouched | Design | client (A) or server/prompt (B) |
| G11 | Link from a risk to a line | `file:12-18` under the title; clicking goes to `anchor.line` | `file_refs` contain paths only: the prompt forbids line numbers, and grounding drops `path:line` (`brief-domain.test.ts`). Clicking opens the file without a line (`RiskList.tsx:42`) | Requires a contract change: add an optional `line` field to `BriefRiskOut`, run it through the same snap to changed ranges as focus, and show `file:line`. Shared first, then server, then client. Without this, clicking goes to the file, which already satisfies P1 | P3 / design | shared + server + client |
| G12 | Review focus block | A separate full-width block (`bg-elevated`, border, radius 10, padding 14/16). Header: `ListChecks` icon (accent), "REVIEW FOCUS — READ THESE FIRST", a count badge. An `<ol>` list; each row is a full-width button with a hover highlight: a `▸` marker (accent), monospace `file:line` (11.5px, no wrap), "— reason" (12.5px) | A "Review focus" subheading inside the shared card, `<ul>`, plain buttons without marker, count or highlight (`FocusList.tsx:20-31`, `styles.ts:97-106`) | Move it into a separate block below the grid and add a header with icon and badge. Switch to `<ol>`, add the marker, `nowrap` for the path and a hover background. Rename the `brief.focusTitle` subheading to "Review focus — read these first" | Design (clickable list is P1, already works) | client (i18n) |
| G13 | Section headings | `SectionLabel` with icons: Target "Intent", AlertTriangle "Risk areas", Workflow "Blast radius" | A custom `s.subTitle` without icons for Summary, Risk areas and Review focus (`styles.ts:23-30`) | Use `SectionLabel` from `@devdigest/ui` with the icons from the design. After G3 the "Summary" heading isn't needed | Design | client |
| G14 | File not in diff | Stay on Overview: a toast "File not in this PR's diff" with an AlertTriangle (warn) icon appears at the bottom center for 2.6 s (`NavToast`, `ScreenPRDetail.goto`) | We switch to Files changed and show a yellow note with the file name there (`DiffTab.tsx:107-111`) | In `openFile` (`page.tsx`) first check the path against the PR's file list. If the file is missing, call `notify` (`client/src/lib/toast.tsx`) with `brief.notInDiff` (keep the file name, AC-54 requires it) and don't switch tabs. Keep the note in `DiffTab` for when a `?tab=diff&file=…` link is opened directly | P3 | client |
| G15 | Navigating to Files changed | The target `DiffFileCard` gets an accent border. The line is softly highlighted once (`dd-line-pulse`, fades over 1.7 s). Smooth scroll with a 130px top offset; the design doesn't use `scrollIntoView` | A permanent 2px accent outline on the line (`diff-viewer/styles.ts:91`). The card has no accent border. `scrollIntoView({block:"center"})` without animation (`FileCard.tsx:120`) | Add a `var(--accent)` border to the target `FileCard`. Instead of the permanent outline (or alongside it) add a 1.7 s fade animation, `@keyframes` in global styles. Make the scroll `behavior: "smooth"` | Design (navigating to the line is P1, works) | client (shared diff-viewer) |
| G16 | Prior PRs | A "Prior PRs touching these files" accordion in the Blast card | None | **Don't do:** in the homework this is a P3 from L04, and it explicitly says it isn't needed for the brief | — | — |

### Not in the design, but we keep it (spec requirements)

- **"Outdated" (AC-45).** A badge shown when the PR head has moved. Move it into the banner next to ↻ (G4).
- **"Generated without: …" and "Left out because…" (AC-16).** Keep as small muted text at the bottom of the brief, below Review focus.
- **Error row with Retry, where the saved brief stays visible (AC-8).** Keep it, place it directly under the banner.
- **The "File not in this PR's diff: {file}" note in Files changed (AC-54).** Stays for a directly opened link (see G14).

## 4. Conflicts with decisions already made

- **G3 (VerdictBanner) and G9 (risk expanding)** were previously excluded from scope. Fully matching the design means bringing them back. That changes the scope of the spec (`specs/2026-10-10-pr-brief.md`, Non-goals) and the plan, so the decision is yours. The minimal version of G3 (a banner row with summary and ↻, without verdict and score) fits within scope.
- **G11** requires changing the `BriefRiskOut` contract and the grounding logic, i.e. shared, server and client. That's a new plan step and new tests.
- **G10, option B** changes the brief prompt. Per `CLAUDE.md`, read `docs/agent-prompts/` before doing that.
- Everything else (G1, G2, G4–G8, G12–G15) is client only, with no contract or API changes.

## 5. Proposed order of fixes

Part 1 is required to match the design; client only, no contract changes:

1. **G1, G2, G13:** recompose Overview into a single PR Brief block: a two-card grid, Review focus at the bottom, `SectionLabel` with icons.
2. **G3 (minimum), G4:** a banner row with summary, ↻ and Outdated.
3. **G8, G10 (option A), G12:** risk pills with icons per `kind`, Review focus block as in the design.
4. **G5, G6, G7:** grid-shaped skeleton, empty state per design, Intent's own texts.
5. **G14, G15:** a toast instead of navigating, a border on the target file and a line animation.

Part 2 by decision (P3, changes scope):

6. **G3 (full):** verdict, score and cost from the latest review in `VerdictBanner`.
7. **G9:** expanding the explanation on pills.
8. **G11:** a line on each risk (contract, server and client) and, optionally, G10 (option B, prompt).

**Tests that will need updating:**

- `BriefCard.test.tsx`: empty-state texts, the Refresh button becomes an icon with an `aria-label`, the risk explanation is hidden until expanded if we do G9.
- `OverviewTab.test.tsx`: new section structure.
- `IntentCard.test.tsx`: new empty-state texts.
- `DiffTab.test.tsx`: only if the note changes.
- A new toast test in `page.test.tsx`.

**Verification:** `cd client && pnpm typecheck && pnpm test && pnpm build`, then a visual comparison against the `hw-01…03` screenshots.
