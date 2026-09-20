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
