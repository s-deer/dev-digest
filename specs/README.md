# Cross-module specs

Top-level `specs/` holds ONLY feature specs that span multiple modules (for example server + client + `@devdigest/shared`). A spec that concerns a single module lives in that module's own folder: `server/specs/`, `client/specs/`, `reviewer-core/specs/`.

A spec says WHAT the feature must do and WHY. It never says HOW: no file names, libraries, tables, or step order. That is the job of the plan.

## Naming

`<YYYY-MM-DD>-<feature-slug>.md` — ISO creation date, then a kebab-case slug. Example: `2026-10-10-project-context.md`. Written in English. One file per feature; never renumber or reuse a spec's acceptance-criteria IDs (`AC-1`, `AC-2`, …) because plans, tests, and verifier reports reference them.

## Status lifecycle

`draft` -> `approved`

- `draft` — written by `spec-creator`; may contain `[NEEDS CLARIFICATION]` markers and open questions.
- `approved` — the user confirmed the spec and no open question remains. Only then is it input for planning. Changing an approved spec means adding or marking acceptance criteria, not silently rewriting them.

## Who does what

- `spec-creator` (`.claude/agents/spec-creator.md`) writes specs. Its only write scope is a single spec file under this folder or a `<module>/specs/` folder.
- `implementation-planner` consumes an approved spec and produces a plan in `docs/plans/`; every plan step references the AC-IDs it satisfies.
- `test-writer` and `plan-verifier` trace tests and results back to the same AC-IDs.

## Template

The spec template (summary, goals/non-goals, user stories, EARS acceptance criteria, edge cases, contracts, open questions, traceability, verification hints) is defined in `.claude/agents/spec-creator.md`.
