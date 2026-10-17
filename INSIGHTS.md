# repo-wide insights

Non-obvious lessons learned while working across the repo — `scripts/`,
`docker-compose.yml`, `.github/` CI, and anything that truly spans packages.
Package-specific lessons go in that package's own `INSIGHTS.md`. Skip routine
changes; only record what would otherwise get re-discovered the hard way.

## What works

### 2026-09-20 · API Contract Reviewer skills are repository fixtures, not seeded rows
- **Context:** HW criterion 43 checks for four API Contract skills and explicitly allows skill files.
- **Insight:** `docs/skills-library/{breaking-change,response-schema,semver-discipline,deprecation-policy}/SKILL.md` is the source fixture; the database seed intentionally keeps only two demo skills and does not import these files automatically.
- **Do:** When auditing criterion 43, inspect `docs/skills-library` and verify each file's directive frontmatter plus Rule/Good/Bad sections; do not infer absence from `server/src/db/seed.ts`.
- **Evidence:** `docs/skills-library/README.md:3-15`, the four `SKILL.md` files, and `tasks/skills/plan.md:197-201,259`.

### 2026-09-19 · Course features reverted from `main` still exist as full reference implementations in history
- **Context:** starting a hw feature (conventions, skills, …) whose scaffolding (tables, contracts, i18n, mock seams) exists but whose module doesn't.
- **Insight:** `c6af1e4 revert: restore main to the starter state` removed finished features, e.g. `641b637 feat(conventions)` with its spec, prompt, evidence gate and tests. The code targets old migrations and contracts, so it can't be cherry-picked, but its design and measured findings still apply.
- **Do:** Before designing, run `git log --all --oneline -- '*<feature>*'` and read the reverted commit's `docs/specs/*.md`. Reuse the design and prompts; rewrite the code on the current branch.
- **Evidence:** `git show 641b637:docs/specs/conventions.md`; `tasks/conventions/spec.md`.

## Decisions

### 2026-09-26 · `.claude/agents/**` is written in English only, whatever language the request uses
- **Context:** creating or editing subagent definitions or `.claude/agents/README.md`; tasks often arrive in Ukrainian, and every agent has the rule "Reply in the language of the request".
- **Insight:** The user rejected a Ukrainian `README.md` for the agents and had it rewritten in English. The reply-language rule covers agent *messages*, not the repo files that define agents.
- **Do:** ALWAYS write `.claude/agents/*.md` content in English; NEVER translate it to match the request language.
- **Evidence:** `.claude/agents/README.md` (rewritten 2026-09-26 on user request).

## Gotchas & recurring errors

### 2026-09-26 · plan-verifier cannot run `pnpm build`, so a plan's build step comes back UNVERIFIABLE unless the implementer reports it
- **Context:** Plans whose Verify or Verification lines include `cd client && pnpm build`, run through the pipeline implementer → plan-verifier (`.claude/agents/`).
- **Insight:** `pnpm build` is outside the plan-verifier's allowed command set. It marks that item UNVERIFIABLE (or E2E PARTIAL), even though typecheck and tests pass.
- **Do:** ALWAYS have the implementer run `pnpm build` and quote the result in its report. Tell plan-verifier the build result was reported by the implementer, so the gap isn't misread as a failure.
- **Evidence:** Smart Diff plan verification (`docs/plans/smart-diff-plan.md`, S10.verify / E2E[2]).
