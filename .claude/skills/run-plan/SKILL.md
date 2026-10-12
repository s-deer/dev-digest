---
name: run-plan
description: Manually-run Spec-Driven Development executor. Takes an APPROVED Development Plan and runs it end to end with subagents - implementer (one per phase) -> architecture-reviewer -> fix loop -> test-writer (limited) -> plan-verifier. Does not run spec-creator or implementation-planner. Invoke only as /run-plan.
argument-hint: <path-to-approved-plan> [extra prompt] [design refs]
disable-model-invocation: true
---

# run-plan

Executes an already approved plan (`docs/plans/<feature>-plan.md`) with the project's subagents. You (the main session) only orchestrate: spawn each subagent, read its report, decide the next stage. Do not implement, review, or test yourself.

Args: `$ARGUMENTS` = plan path, then optional extra prompt (extra requirements) and design refs (paths/links). Pass the extra prompt and design refs verbatim to the implementer as context; they never override the plan's File inventory.

## Not included (run manually, separately)

`spec-creator`, `implementation-planner`. Suggested at the end, not run: `doc-writer`, `/pr-self-review`. Never commit or push; only on explicit user request.

## Budget rules

- `architecture-reviewer` and `plan-verifier` run on sonnet; keep them so.
- `test-writer` is limited on first runs: no e2e flows, no parallel runs, tests derived from the spec's AC-IDs (not from the code). Tell it so in the prompt.
- Strictly sequential: one subagent at a time. Give each only what it needs (plan path, phase/step ids, previous report excerpt), not the whole transcript.

## Workflow

### 0. Validate (stop and ask the user on any failure)

1. The plan file exists.
2. Its status is `approved` (header/status line). Otherwise stop: the user must approve it first.
3. It has AC coverage: steps reference spec AC-IDs and each step has Files + Acceptance. Locate the spec it cites; if missing, warn but continue.
4. Read the execution mode and phases from the plan (single vs multi-agent, phase list). No phases listed = one phase containing all steps.

### 1. Implement, per phase

For each phase in order, spawn ONE `implementer` subagent: plan path, the phase's step ids, extra prompt/design refs. Wait for its report. Check Status and the Checks section before the next phase.

- `BLOCKED` or failing checks that block later phases: stop, show the report, ask the user. Do not skip ahead.
- `PARTIAL`: continue only if the remaining steps do not depend on the missing ones; note it.

### 2. Architecture review

Spawn `architecture-reviewer` (plan path + base ref `main`/merge-base, or the changed-file list from the implementer reports).

### 3. Fix loop (max 2 iterations)

While verdict is `CHANGES REQUESTED` or `BLOCK` and iterations < 2: spawn `implementer` with the findings (rule, `path:line`, fix) as the task, then re-run `architecture-reviewer`. After 2 iterations still not passing: stop and escalate to the user with the open findings. `PASS` / `PASS WITH NOTES` proceed.

### 4. Tests

Spawn `test-writer` (limited, see Budget): plan path, spec path, step ids. Red tests it reports as suspected product bugs or needed non-test changes go to one `implementer` pass, then rerun only the affected tests via test-writer.

### 5. Verify (final, read-only)

Spawn `plan-verifier`: plan path, spec path, implementer reports, base ref. It returns the AC -> task -> test -> commit matrix and unclosed rows.

- `VERIFIED` / `VERIFIED WITH GAPS`: done; list the gaps.
- `NOT VERIFIED`: ONE `implementer` fix pass on the NOT MET/PARTIAL rows (plus `test-writer` if the gap is a missing test), then re-run `plan-verifier` once. Still not verified: report to the user, do not loop further.

## Final summary (concise)

```
## run-plan: <plan path>
| Stage | Status | Notes |
|---|---|---|
| Validate | OK/STOP | ... |
| Implement (phase A..N) | DONE/PARTIAL/BLOCKED | ... |
| Architecture review | verdict, iterations used | open findings |
| Test-writer | DONE/SKIPPED | tests added, red tests |
| Plan-verifier | verdict (MET/PARTIAL/NOT MET/UNVERIFIABLE counts) | unclosed rows |
```

Then: open issues needing the user; suggest next steps manually - `doc-writer`, `/pr-self-review`, and `/workflow-retro` to review how this run went (tokens, agents, duplicates). Do not start any of them.
