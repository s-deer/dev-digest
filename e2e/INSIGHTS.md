# e2e insights

Non-obvious lessons learned while working here — what was tried, what didn't
work, and why. One entry per insight (date + short title + a few lines),
newest last. Skip routine changes; only record what would otherwise get
re-discovered the hard way.

### 2026-09-19 · Text locators are more reliable than role-name locators for the sidebar navigation
- **Context:** `e2e/specs/10-conventions.flow.json` opening the new Conventions nav item.
- **Insight:** The vendored `NavItem` puts the visible label inside a nested `div` within the link, and `agent-browser find role link --name Conventions` did not resolve it even though the link was visible.
- **Do:** Use the deterministic `find text Conventions click` locator for these sidebar items unless the nav primitive exposes an accessible link name.
- **Evidence:** `client/src/vendor/ui/shell/NavItem.tsx`, `e2e/specs/10-conventions.flow.json`.

### 2026-09-27 · `agent-browser wait --text` matches a substring, not the exact string
- **Context:** renamed the Smart Diff `smartDiff.coreLabel` string from `"Core"` to `"Core logic"`; `specs/05-pr-diff.flow.json` step `wait --text "Core"` waits for the group header.
- **Insight:** Ran `./scripts/e2e.sh` after the rename with the flow file untouched — flow 05 still passed. `wait --text` treats its argument as "page contains this text somewhere," so a label that grows (old text stays a prefix/substring of the new one) doesn't need the flow updated.
- **Do:** Before editing a flow for a renamed label, check whether the old wait string is still a substring of the new one — it usually still passes unedited. Only edit the flow when the old text is no longer contained in the new one.
- **Evidence:** `e2e/specs/05-pr-diff.flow.json` (`wait --text "Core"`), `client/messages/en/prReview.json` (`smartDiff.coreLabel`).

## Gotchas & recurring errors

### 2026-10-02 · `find role --name` sees a `Chip`'s label+count with no space, unlike `snapshot`
- **Context:** `e2e/specs/10-conventions.flow.json` clicking the Conventions filter chips (`Pending` with count `2`).
- **Insight:** `agent-browser snapshot -i` prints the chip as `button "Pending 2"`, but `find role button click --name "Pending 2"` fails with "Element not found" with or without `--exact`. `find` matches the name as `"Pending2"`, because the vendored `Chip` renders the count in an adjacent `<span>` with no whitespace text between them.
- **Do:** To target a counted chip, use `--name "<Label><count>" --exact` (e.g. `"Pending2"`). Keep `--exact`: a loose name like `Accepted` or `pending` can hit the per-card `Accepted` button or `Accept all pending`, and both of those write data. Don't copy names from `snapshot` output as-is.
- **Evidence:** `client/src/vendor/ui/primitives/Chip.tsx`, `e2e/specs/10-conventions.flow.json`.
