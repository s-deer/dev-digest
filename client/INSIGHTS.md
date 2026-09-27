# client insights

Non-obvious lessons learned while working here — what was tried, what didn't
work, and why. One entry per insight (date + short title + a few lines),
newest last. Skip routine changes; only record what would otherwise get
re-discovered the hard way.

## Gotchas & recurring errors

### 2026-09-19 · Findings keyboard shortcuts must be scoped to the focused panel
- **Context:** `FindingsPanel` is mounted inside multiple review accordions on the PR detail page.
- **Insight:** A `window` keydown listener in every panel makes one shortcut trigger all mounted panels and also intercepts modified browser shortcuts such as Cmd/Ctrl+A.
- **Do:** Handle shortcuts on a focusable panel root, ignore modifier keys and editable controls, and keep the empty-list path from producing focus index `-1`.
- **Evidence:** `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx` and its keyboard-scope test.

### 2026-09-17 · The PR list table card clips any absolutely positioned popover inside a row
- **Context:** hover popovers or tooltips inside `/repos/:repoId/pulls` rows
- **Insight:** `s.tableCard` sets `overflow: "hidden"` to keep the rounded corners. A `position: absolute` popover in a row gets cut off at the card edge, worst on the bottom rows.
- **Do:** ALWAYS position the popover with `position: fixed`, computed from the trigger's `getBoundingClientRect()` and flipped above in the lower half of the viewport. Reuse `FindingsBadges` / `positionFor` rather than writing a new one.
- **Evidence:** `client/src/app/repos/[repoId]/pulls/styles.ts:90`, `client/src/components/findings-summary/FindingsBadges.tsx:20`, `client/src/components/findings-summary/styles.ts:19`

### 2026-09-19 · Vendored `<Markdown>` renders headings and lists as plain text unless `.dd-md` block styles exist
- **Context:** rendering skill bodies, PR descriptions, or any Markdown through `@devdigest/ui` `Markdown`.
- **Insight:** The primitive only styles inline elements (`p`, `strong`, `code`, `a`); the global reset strips heading sizes and list markers, so the "rendered" view looked like raw text, and inline `code` padding leaked into fenced blocks.
- **Do:** Keep block styles in `client/src/app/globals.css` under `.dd-md` (the class the primitive already sets); don't edit `src/vendor/ui` or add per-page Markdown CSS.
- **Evidence:** `client/src/vendor/ui/primitives/Markdown.tsx`, `.dd-md` rules in `client/src/app/globals.css`.

### 2026-09-19 · Duplicate top-level JSON keys silently hide translation messages
- **Context:** adding localized strings to `client/messages/en/conventions.json`.
- **Insight:** Two top-level `card` objects parsed successfully, but the later object replaced the first and caused `next-intl` `MISSING_MESSAGE` errors for action labels.
- **Do:** Keep each translation namespace unique and run a focused component test after editing message JSON; JSON parsing alone will not detect duplicate keys.
- **Evidence:** `client/messages/en/conventions.json`, `ConventionCard.test.tsx`.

### 2026-09-20 · Named controls need labels on the Toggle itself
- **Context:** the skills sidebar toggle was wrapped in a labelled group, but its `role="switch"` button still had no accessible name.
- **Insight:** A group label does not name its child switch, so role/name queries and screen readers identify it as an anonymous control.
- **Do:** Pass `ariaLabel` to `@devdigest/ui` `Toggle`; its button forwards the value to `aria-label`.
- **Evidence:** `client/src/vendor/ui/primitives/Toggle.tsx`, `SkillsSidebar.test.tsx`.

### 2026-09-26 · RunTraceDrawer's "Prompt assembly" section starts collapsed
- **Context:** adding an assertion for a new `PromptBlock` (the derived PR intent) inside `TraceBody`'s "Prompt assembly" section.
- **Insight:** `TraceSection` for "Prompt assembly" is rendered with `defaultOpen={false}` (unlike Configuration/Stats), so its children — every `PromptBlock` label — are not in the DOM until the section header is clicked. A `getByText` on a prompt-block label fails even though the block is correctly conditionally rendered by the parent.
- **Do:** `fireEvent.click(screen.getByText("Prompt assembly"))` before asserting on any `PromptBlock` label in a `RunTraceDrawer` test.
- **Evidence:** `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:75`, `RunTraceDrawer.test.tsx`.

### 2026-09-26 · A disabled TanStack Query keeps `isPending: true` forever, so `isLoading || isPending` never resolves
- **Context:** `IntentCard` showed an endless skeleton whenever `prId` was `null` (e.g. before the PR-number → uuid lookup resolved).
- **Insight:** `usePrIntent`'s `useQuery` uses `enabled: !!prId`. With `enabled:false`, TanStack Query v5 never fetches, so `isPending` stays `true` indefinitely — but `isLoading` (`isPending && isFetching`) correctly stays `false`. Gating the skeleton on `isLoading || isPending` therefore never leaves the loading state once `prId` becomes available with no data yet, and shows it forever while `prId` is `null`.
- **Do:** For a query disabled on a nullable key, branch on `!key || isLoading` and drop `isPending` from the loading condition entirely.
- **Evidence:** `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx`, `client/src/lib/hooks/intent.ts`.

### 2026-09-26 · `next-intl` logs `MISSING_MESSAGE` instead of throwing, so a missing namespace doesn't fail a test
- **Context:** adding a `useTranslations("prReview")` call to `CodeLine`/`FileCard` (shared `components/diff-viewer/**`) for Smart Diff's inline finding labels.
- **Insight:** `src/test/smoke.test.tsx` renders `DiffViewer` with only `{ shell: shellMessages }` in `NextIntlClientProvider`. Adding a second namespace to a component it renders doesn't fail that test — `next-intl` prints `IntlError: MISSING_MESSAGE` to stderr and renders the raw key/fallback, so the suite stays green while quietly breaking the missing namespace's UI.
- **Do:** When a widely-rendered shared component (`components/**`, not a single feature) gains a new `useTranslations` namespace, grep for every other test/fixture that renders it (not just its own `*.test.tsx`) and add the namespace there too — a passing run doesn't prove the message resolved.
- **Evidence:** `client/src/test/smoke.test.tsx`, `client/src/components/diff-viewer/CodeLine/CodeLine.tsx`.
