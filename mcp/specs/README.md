# mcp specs

This package was built from a single development plan rather than per-feature
spec files: **[`docs/plans/mcp-server-plan.md`](../../docs/plans/mcp-server-plan.md)**.
It covers the full design — tool list, contracts, onion-architecture alignment,
token-budget rules, and design decisions (the facade trade-off and its revisit
trigger) — across four phases (foundation, review run flow, token budget +
blast-radius stub, docs/CI/rollout).

Read the plan before changing a tool's shape or adding a new one. Record
implementation lessons in [`../INSIGHTS.md`](../INSIGHTS.md), not here.

No other specs yet — add one under this folder for the next non-trivial
feature (e.g. a real `get_blast_radius`), following the pattern in
`reviewer-core/specs/README.md`.
