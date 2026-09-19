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
