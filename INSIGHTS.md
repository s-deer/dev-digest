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

### 2026-09-19 · The pr-self-review hook denies any Bash command whose text contains `gh pr create`/`gh pr merge`/`git push`
- **Context:** `.claude/settings.json` PreToolUse hook → `.claude/skills/pr-self-review/scripts/gate.mjs --hook`, run on every Bash call in Claude Code.
- **Insight:** The gate regex-matches the raw command string, not the parsed argv. So `echo`, heredocs, test fixtures or `grep` patterns that contain those words are blocked with "no self-review verdict" even though nothing gets pushed.
- **Do:** When a command only needs to *mention* these words (tests, fixtures), build the string at runtime (`"git "+"push"`) or keep it in a file. NEVER edit the matcher or the settings to get past the gate; run /pr-self-review instead.
- **Evidence:** `GATED` regex in `.claude/skills/pr-self-review/scripts/gate.mjs`; reproduced by piping a hook JSON that contains `gh pr create` through `echo`.

### 2026-09-26 · `verdict.mjs` needs the same `--base` as `prepare.mjs`, or it reports a phantom "files changed"
- **Context:** `/pr-self-review` on uncommitted work, run as `prepare.mjs --base HEAD` because `origin/main` was reset to the starter state and its merge-base drags in hundreds of unrelated commits.
- **Insight:** Before the first verdict exists, `verdict.mjs triage|write` recompute the fingerprint against the default base (`origin/main`) unless given `--base`. They then fail with `No prepare.json for the current diff (fingerprint …). The files changed since the last run`, even though no file changed.
- **Do:** ALWAYS pass the identical `--base <ref>` to `prepare.mjs`, `verdict.mjs triage` and `verdict.mjs write`. NEVER "fix" the message by rerunning prepare (see next entry).
- **Evidence:** `.claude/skills/pr-self-review/scripts/verdict.mjs:119` (`collectDiff(args.base ?? latest?.baseRef)`); fingerprint `3b807c1a…` without `--base` vs `11560683…` with `--base HEAD`, same tree.

### 2026-09-26 · Rerunning `prepare.mjs` deletes the reviewers' findings even when the fingerprint is unchanged
- **Context:** `/pr-self-review` between stage 2 (per-skill subagents write `work/<fingerprint>/llm/<skill>.json`) and `verdict.mjs write`.
- **Insight:** `prepare.mjs` always wipes `work/<fingerprint>/` before recreating it, so a rerun on identical content silently discards every `llm/*.json`; `write` then sees no findings for those skills.
- **Do:** NEVER rerun `prepare.mjs` after launching the skill reviewers unless files really changed; if it happened, rerun the affected reviewers — do not reconstruct their JSON by hand.
- **Evidence:** `.claude/skills/pr-self-review/scripts/prepare.mjs:18` (`rmSync(workDir, { recursive: true, force: true })`).

### 2026-09-26 · plan-verifier cannot run `pnpm build`, so a plan's build step comes back UNVERIFIABLE unless the implementer reports it
- **Context:** Plans whose Verify or Verification lines include `cd client && pnpm build`, run through the pipeline implementer → plan-verifier (`.claude/agents/`).
- **Insight:** `pnpm build` is outside the plan-verifier's allowed command set. It marks that item UNVERIFIABLE (or E2E PARTIAL), even though typecheck and tests pass.
- **Do:** ALWAYS have the implementer run `pnpm build` and quote the result in its report. Tell plan-verifier the build result was reported by the implementer, so the gap isn't misread as a failure.
- **Evidence:** Smart Diff plan verification (`docs/plans/smart-diff-plan.md`, S10.verify / E2E[2]).
