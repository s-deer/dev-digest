# Workflow retro ledger

One row per run, appended by the manual `/workflow-retro` skill ([`.claude/skills/workflow-retro/SKILL.md`](../../.claude/skills/workflow-retro/SKILL.md)). Append-only: never rewrite earlier rows. Use `n/a` for anything not measured; do not estimate.

## Columns

| Column | Meaning |
|---|---|
| Date | Run date, `YYYY-MM-DD` |
| Workflow | What ran, e.g. `run-plan project-context-plan` |
| Mode | `context` or `deep` |
| Agents | Number of agents launched, in launch order (e.g. `6: implementer>reviewer>...`) |
| Max concurrency | Peak simultaneous agents, including nested subagents |
| Tokens in / out / cache read | Totals across parent and children, `in / out / cache` |
| Tool calls | Total count |
| Duration | Wall clock, e.g. `42m` |
| Cost per AC | Total tokens / ACs closed |
| Rework loops | Extra fix iterations and BLOCKED steps |
| First-pass findings | Reviewer findings before the fix loop |
| Verifier unclosed | `plan-verifier` rows not PASS |
| Top actions | 1-3 proposed improvements, short |

## Ledger

| Date | Workflow | Mode | Agents | Max concurrency | Tokens in / out / cache read | Tool calls | Duration | Cost per AC | Rework loops | First-pass findings | Verifier unclosed | Top actions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-10 | Lab 05 SDD: P1–P13 (spec-creator→planner→implementer A–D→test-writer→arch-review→fixes→verifier→doc-writer) | deep | 19 (incl. 1 refused retro): implementer×5 (P1–P5)>spec-creator>implementation-planner>implementer×4 (A–D)>test-writer>architecture-reviewer>implementer>plan-verifier>implementer>plan-verifier>doc-writer>general-purpose | 1 (strictly sequential) | subagents 1.3k / 107.6k / 59.8M; parent session 0.3k / 90.7k / 15.8M (output counts from transcript usage, likely undercounted) | 399 subagents + 49 parent | ~88m (12:39–14:07 subagents) | ~3.7k output tokens/AC (198k out / 53 ACs MET) | 2 fix passes (P11, P12 gap-fix), 0 BLOCKED | 1 (low) | 11 first pass (5 PARTIAL + 6 UNVERIFIABLE) → 6 after re-check | trim repeated plan/spec reads; make verifier a one-pass check; keep retro out of subagents |
