# DevDigest subagents

A map of the project's subagents. Full instructions live in the `<agent>.md` files next to this one; this page covers only roles, boundaries, and the contracts between agents.

## Summary

| Agent | Responsibility | Tools | Model | Input | Output |
| --- | --- | --- | --- | --- | --- |
| [`researcher`](researcher.md) | Find and substantiate the answer to a specific question (repository, external sources, or both) | Read, Grep, Glob, Bash (read-only), WebSearch, WebFetch | sonnet | A specific question, plus package / version / depth when needed | Report: findings, evidence (`path:line`, quotes), references, "Not found" |
| [`planner`](planner.md) | Turn a task into a Development Plan that can be executed without further decisions | Read, Grep, Glob, Bash (read-only) | opus | Task description (often with a spec in `tasks/`) | Plan S1..Sn (or "Clarification needed") as its final message; the main session saves it, usually to `tasks/<slug>/plan.md` |
| [`implementer`](implementer.md) | Execute an approved plan, prove each step with a check, report honestly | Read, Grep, Glob, Edit, Write, Bash, Skill | sonnet | Path to an approved plan | Implementation report: step statuses, acceptance, checks run, deviations, hand-off for review |
| [`test-writer`](test-writer.md) | Write or repair behavior tests at the seams (client RTL, server hermetic / `*.it.test.ts`, reviewer-core) | Read, Grep, Glob, Edit, Write, Bash | sonnet | Plan + step ids, a file / feature, or the current diff | Test report: tests and the regression each catches, checks run, red tests, hand-offs |
| [`architecture-reviewer`](architecture-reviewer.md) | Check architectural boundaries of a diff and return evidence-backed findings | Read, Grep, Glob, Bash (read-only) | opus | Base ref or file list, optionally a plan | Findings (rule + source + `path:line` + quote + fix) and a derived verdict |
| [`plan-verifier`](plan-verifier.md) | Verify the code against every item of the plan and spec | Read, Grep, Glob, Bash (read-only + verification commands) | sonnet | Plan path (+ spec, implementation report, base ref) | Traceability matrix item → MET / PARTIAL / NOT MET / UNVERIFIABLE → evidence, and a derived verdict |
| [`doc-writer`](doc-writer.md) | Document an implemented feature in the right place, with diagrams grounded in code | Read, Grep, Glob, Edit, Write, Bash | sonnet | Feature / plan / spec / implementation report / paths | Docs report and the doc files themselves |

## Typical flow

```
question ──► researcher ──► report (facts, evidence)
                              │ (as input to planning, when needed)
task ──► planner ──► plan.md ──► [user approval] ──► implementer ──► report
                                                          │
                                   (gaps in tests) ───────┼──► test-writer ──► test report
                                                          ▼
                            plan-verifier ∥ architecture-reviewer   (both read-only, in parallel)
                                                          │
             NOT VERIFIED / CHANGES REQUESTED / BLOCK ────┼──► implementer (fixes) ──► re-verify
                                                          ▼
                                           doc-writer ──► /pr-self-review ──► PR
```

- `researcher` is independent: it answers questions, and `planner` does not launch it — external facts go under "Risks & open questions → researcher".
- **User approval of the plan** is mandatory between `planner` and `implementer`.
- `test-writer` fills test gaps after `implementer`. Red tests (suspected product bugs) and needed non-test changes (mocks, setup, dependencies) go back to `implementer`.
- `plan-verifier` and `architecture-reviewer` run after implementation, in parallel. `plan-verifier` checks completeness against the plan and spec; it does not review code. `architecture-reviewer` checks boundaries only.
- `doc-writer` runs once the feature is verified, so it documents code that will ship.
- Security review and `/pr-self-review` remain separate stages; none of the seven agents performs them.

## Permissions and boundaries

No agent spawns subagents, runs `git commit/push/checkout/reset/stash`, or touches `server/clones/**`, `**/node_modules/**`, or lockfiles. The repo hook matches raw command text, so no agent puts the words of PR creation, merge, or push commands into any Bash command.

| Agent | Can | Cannot |
| --- | --- | --- |
| `researcher` | Read code and git history (`git log/show/blame/diff`, `ls`, `wc`, `head`); use the internet | Modify files; redirect with `>`/`>>`, `tee`, `rm/mv/cp`; install, start servers, run migrations; use skills |
| `planner` | Read code, specs, INSIGHTS, git history | Create or edit files; run tests, migrations, servers; use the internet; write INSIGHTS (only proposes in "Risks") |
| `implementer` | Edit only the files in the plan's "File inventory"; run typecheck / tests of touched packages; use the Skill tool (e.g. `security`); write INSIGHTS | Go beyond the inventory (except a minimal mechanical change listed under "Deviations"); hand-edit `server/src/db/migrations/**`; add dependencies not in the plan; run `gh pr`, `/pr-self-review`, `security-review`; use the internet |
| `test-writer` | Edit test files only (`client/src/**/*.test.{ts,tsx}`, `server/test/**`, `reviewer-core/test/**`; `e2e/specs/*.flow.json` only on explicit request); run the affected suites; write INSIGHTS | Edit production code, `server/src/adapters/mocks.ts`, `client/src/test/setup.ts`, `vitest.config.ts`, `package.json`; add dependencies; skip, delete, or weaken tests; add DB access to non-`.it.` tests |
| `architecture-reviewer` | Read code and git history; run `route.mjs` (prints only) | Modify files; run tests, typecheck, `prepare.mjs`, `verdict.mjs`; report security, style, or performance findings |
| `plan-verifier` | Read code; run verification commands (`pnpm typecheck/test`, `pnpm exec vitest run`, `npm run typecheck`, `npm test`, `route/checks/diff-rules.mjs`); `e2e:hermetic` only on explicit request | Modify files; run state-changing commands even if the plan lists them (`pnpm db:generate`, `db:migrate`, `db:seed`, `dev.sh`, installs, `prepare.mjs`, `verdict.mjs`); give generic advice |
| `doc-writer` | Edit `<pkg>/docs/**`, package and root `README.md`, `server/src/modules/*/README.md`, `TESTING.md`, `docs/agent-prompts/*.md`, one "Read when" line in `<pkg>/AGENTS.md`; write INSIGHTS | Edit source, tests, `specs/`, `tasks/`, `docs/skills-library/`, `.claude/`; edit a `CLAUDE.md` symlink; document a plan as if it were implemented |

**INSIGHTS ownership:** `implementer`, `test-writer`, and `doc-writer` write entries through the `engineering-insights` skill. `researcher`, `planner`, `architecture-reviewer`, and `plan-verifier` only propose candidates in their reports.

**Retry limits:** `implementer` — 3 attempts per step, then `BLOCKED`. `test-writer` — 3 attempts per test file.

**Write scope enforcement** for `test-writer` and `doc-writer` is by prompt rules plus a `git status --short` self-check (as with `implementer`); frontmatter cannot restrict paths.

## Preloaded skills

`skills:` in the frontmatter injects the full skill content at startup.

| Agent | Skills | Why |
| --- | --- | --- |
| `planner`, `implementer` | `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `react-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `zod`, `typescript-expert`, `engineering-insights` | Same list, so the implementer follows the rules the plan quotes |
| `test-writer` | `react-testing-library`, `react-architecture`, `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `typescript-expert`, `engineering-insights` | RTL for client tests; onion "Testing by ring" for choosing server seams; Fastify `app.inject`; Drizzle for `*.it.test.ts`; Zod for contract tests |
| `architecture-reviewer` | `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `react-architecture`, `next-best-practices`, `zod`, `typescript-expert` | Boundary rules only. `react-best-practices` and `postgresql-table-design` are left out on purpose: render-level and schema-design concerns belong to `/pr-self-review` |
| `plan-verifier` | none | It checks the concrete rules the plan already quotes; it reads a skill file only when a quoted rule is ambiguous |
| `doc-writer` | `mermaid-diagram`, `engineering-insights` | Diagrams; telling lessons (INSIGHTS) apart from how-it-works material (docs) and recording them |
| `researcher` | none | Does not use skills |

`security` is deliberately preloaded in no agent: it is a separate review stage. If a file routes to it, `planner` reads `.claude/skills/security/` and lists points under "Notes for reviewers → Security", `implementer` loads it with the Skill tool, and `architecture-reviewer` only points to the security review.

## Artifacts

| Artifact | Created by | Consumed by | Lives in |
| --- | --- | --- | --- |
| Research report | `researcher` | user, `planner` (through the main session) | agent message |
| Clarification needed | any agent when its input is unclear (at most 5 questions) | user | agent message |
| Development Plan | `planner` | user (approval), `implementer`, `plan-verifier`, `architecture-reviewer` | `tasks/<slug>/plan.md` (saved by the main session) |
| Implementation report | `implementer` | user, `test-writer`, `plan-verifier`, reviewers | agent message |
| Test report | `test-writer` | user, `implementer`, `plan-verifier` | agent message |
| Architecture review | `architecture-reviewer` | user, `implementer` | agent message |
| Plan verification (traceability matrix) | `plan-verifier` | user, `implementer` | agent message |
| Docs report + doc files | `doc-writer` | user, future agents | agent message; files in `<pkg>/docs/`, READMEs, `TESTING.md` |

Plan sections the other agents rely on:

- `implementer`: **Steps** (Files, Skills & rules, Tests, Acceptance, Verify), **File inventory** (the boundary of allowed changes), **Notes for reviewers** (hand-off to architecture and security review).
- `plan-verifier`: every section — each step field, File inventory, Verification (end-to-end), and Out of scope become rows in the traceability matrix.
- `architecture-reviewer`: **Notes for reviewers → Architecture** become mandatory checks.
- `test-writer`: the **Tests** and **Acceptance** lines of the requested steps.

## Rule sources

The agents' rules are not invented separately; they reflect these project documents.

### Shared by all agents that work with code

| Source | Rules derived from it |
| --- | --- |
| `CLAUDE.md` (root) | Reading order `specs/ → docs/ → INSIGHTS.md → source`; excluding `server/clones/**`; no hand-edited migrations or lockfiles; pnpm for `server/` + `client/`, npm for `reviewer-core/` + `e2e/`; contracts first in `@devdigest/shared`; `*.it.test.ts` (DB) vs hermetic tests; no secrets in git or DB; `docker compose down -v` is forbidden |
| `.claude/skills/pr-self-review/routing.md` | Single source of truth for which skill governs which file; `planner` attaches rules to steps with it, `implementer` and `test-writer` pick skills with it, `architecture-reviewer` uses `route.mjs` output. This keeps the pre-PR self-review consistent with the plan |
| `.claude/skills/pr-self-review/severity.md` | The one severity scale for `architecture-reviewer` ("if in doubt, go one level lower"; known deviations are not findings unless deepened) |
| `.claude/settings.json` → `gate.mjs` hook | Gated command words never appear in any agent's Bash command |
| `<pkg>/INSIGHTS.md` and root `INSIGHTS.md` | Rejected approaches are honored; `planner` names applicable entries, others read those relevant to their work; git history as a reference for reverted features (root INSIGHTS) |
| `<pkg>/AGENTS.md` (`server/`, `client/`, `reviewer-core/`, `e2e/`) | Naming of components, modules, locale files; engine purity |
| Skill `engineering-insights` | Entry format and routing; the writing agents record only verified, non-obvious findings, the others only propose |

### `planner` only

| Source | Rules derived from it |
| --- | --- |
| `<pkg>/specs/`, `<pkg>/docs/`, `tasks/<slug>/` | What we build and how it works — read first; spec acceptance criteria carry over into the plan |
| Skill `onion-architecture` | Layers routes → service → repository, ports / adapters, `platform/container.ts` as composition root; mandatory for server steps |
| Skill `react-architecture` | Placement of components, hooks, constants, data; mandatory for client steps |
| Skills `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `react-best-practices`, `next-best-practices`, `zod`, `typescript-expert` | Concrete rules copied into each step's "Skills & rules" field |
| `TESTING.md` | Behavior at the seams, happy path + one meaningful edge, mocks via `server/src/adapters/mocks.ts`, e2e only when a main user journey changes |
| `.claude/skills/security/` | Points for "Notes for reviewers → Security" |

### `implementer` only

| Source | Rules derived from it |
| --- | --- |
| Approved plan (`tasks/<slug>/plan.md`) | File inventory as the change boundary; Acceptance and Verify as completion criteria |
| Skill `react-testing-library` | Writing client tests |
| Skill `security` (by routing) | Secure code in files routed to it |
| `TESTING.md`, commands from `CLAUDE.md` | Which checks to run (`pnpm typecheck/test`, `npm run typecheck` / `npm test`), `server/src/vendor/shared` ↔ `client/src/vendor/shared` comparison, `pnpm db:generate` after changing `schema.ts`, `*.it.test.ts` without Docker = SKIPPED, not PASS |

### `test-writer` only

| Source | Rules derived from it |
| --- | --- |
| `TESTING.md` | Typological, not exhaustive; behavior at the seams; the unit / integration lane split and commands |
| `onion-architecture/references/testing.md` | "Testing by ring": which seam and file per server layer; fakes over deep mocks; a service test needing Docker is a layering smell |
| Skill `react-testing-library` | Query priority, `findBy*` for async, mock at boundaries |
| Existing client tests | Repo convention: `fireEvent` and hook-level `vi.mock` (`user-event` and `msw` are not installed) |

### `architecture-reviewer` only

| Source | Rules derived from it |
| --- | --- |
| Skills `onion-architecture`, `react-architecture`, `next-best-practices` | Server dependency rule and review checklist; client dependency direction and data layer; RSC boundaries |
| `reviewer-core/AGENTS.md` | Engine purity, public surface via `src/index.ts`, `wrapUntrusted()`, grounding gate |
| `server/INSIGHTS.md` | Shared-contract drift is judged by the targeted diff, not by `diff -r` |

### `plan-verifier` only

| Source | Rules derived from it |
| --- | --- |
| `planner.md` output format | How plan items are enumerated into ids (`Sx.files`, `Sx.change`, `INV`, `E2E`, `SCOPE.out`) |
| The spec (`tasks/<slug>/spec.md` or `<pkg>/specs/`) | Requirement rows `R<i>` |
| `implementer.md` rules | SKIPPED is never PASS; declared deviations are not scope drift |

### `doc-writer` only

| Source | Rules derived from it |
| --- | --- |
| `<pkg>/docs/README.md` indexes, package READMEs | Where each kind of content goes; every new doc gets an index bullet |
| `server/docs/run-lifecycle-and-cost.md` | House style for docs |
| Skill `mermaid-diagram` | Diagram type choice and syntax |
| Root `INSIGHTS.md` | `docs/skills-library/` is product fixture content, not documentation |

## Which agent when

- "Where / how is this implemented, why was it done this way, what has been tried?" → `researcher`.
- "How do I build a feature that touches `server/`, `client/`, or `@devdigest/shared`?" → `planner`, then (after approval) `implementer`.
- "Tests are missing, thin, or failing for this file / feature / diff" → `test-writer`.
- "Does this change break layer or package boundaries?" → `architecture-reviewer`.
- "Is the plan fully implemented?" → `plan-verifier`.
- "Document this feature / draw a diagram of how it works" → `doc-writer`.
- A trivial single-file change needs no agents.
