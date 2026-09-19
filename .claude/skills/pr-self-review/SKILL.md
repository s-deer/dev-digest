---
name: pr-self-review
description: Self-review of all local changes (commits, staged, unstaged, untracked vs origin/main) before a pull request is opened. It runs typecheck/tests and whole-diff rules, then routes every changed file to the matching project skills (UI skills on client/ files, onion/Fastify/Drizzle skills on server/ files, …) and reviews with one subagent per skill. It writes a PASS/BLOCK verdict that a hook enforces on `gh pr create`, `gh pr merge` and `git push`. Use it when the user says "self-review", "review my changes before the PR", "перевір зміни перед PR", "can I open a PR", runs /pr-self-review, or when the pr-self-review gate blocked a command. Any confirmed critical finding blocks the PR.
---

# PR self-review

Reviews the **local diff** before it becomes a PR. A confirmed `critical` finding blocks it: the
hook in `.claude/settings.json` (and the optional git `pre-push` hook) refuses `gh pr create`,
`gh pr merge` and `git push` until the verdict for the *current* content is `PASS`.

All scripts are in `.claude/skills/pr-self-review/scripts/` (Node ≥ 22, no dependencies) and are
run from the repo root. Below, `S=.claude/skills/pr-self-review/scripts`.

## Workflow

### 1. Deterministic stage

```sh
node $S/prepare.mjs            # add --it to also run server *.it.test.ts (Docker), --no-tests for typecheck only
```

This one command does all of the following:
- **Collects the diff**: everything that differs from `merge-base(origin/main, HEAD)`, including
  commits, staged, unstaged and untracked files. Use `--base <ref>` for a different target
  branch. It computes the **fingerprint**, a hash of the content of every changed file.
  Committing does not change the fingerprint; editing any file does.
- **Diff rules** (`diff-rules.mjs`): schema changed without a new migration, an applied migration
  edited, vendored code or `server/clones/**` touched, secret files or key-like strings added.
- **Checks** (`checks.mjs`): typecheck and hermetic tests of every touched package, each with its
  own package manager. If `@devdigest/shared` changed, the client is typechecked too
  (contract-first). **Onion-lint**: added imports of `fastify`, `drizzle-orm`, `db/schema`, or an
  SDK in inner-ring server files.
- **Routing** (`route.mjs` + `routing.md`): which skill reviews which files.

**If prepare prints `BLOCK`, stop here.** It has already written the verdict, and the LLM stage
would only spend tokens. Show the report, fix, and rerun. Otherwise, continue with the
assignments it printed.

If it reports **unrouted skills**, mention them in your final report. Someone added a skill
without a row in `routing.md`.

### 2. Skill review, one subagent per skill, all in parallel

Read `work/<fingerprint>/prepare.json` → `routing.assignments`. For **each** skill in it, launch a
`general-purpose` subagent **in the same message** (parallel), with this prompt, filled in:

```
You are reviewing a local diff with ONE skill: <skill>.
1. Read .claude/skills/<skill>/SKILL.md (and any reference file it points to that is relevant
   to these files). Read .claude/skills/pr-self-review/severity.md, which is the only severity
   scale you may use.
2. Read the INSIGHTS.md of the package(s) involved (<package>/INSIGHTS.md): decisions recorded
   there are not findings.
3. Files assigned to you:
   <file list>
   See what changed with: git diff <base> -- <files>   (untracked files: read them whole)
   Review ONLY what the diff adds or changes. Read the surrounding code where you need context.
   Never read or grep server/clones/**.
4. Write your findings to <workDir>/llm/<skill>.json as a JSON array (write [] if none):
   [{ "file": "repo/relative/path", "line": 42, "severity": "critical|high|medium|low",
      "rule": "<rule or section name from the skill that this violates>",
      "evidence": "<what the code does and what goes wrong, concretely>",
      "fix": "<the concrete change>" }]
   A finding without a rule from the skill is not a finding. Do not edit any source file.
5. Reply with one line: "<skill>: N findings (C critical)".
```

Keep your own context small. Don't paste the diff into the prompts; subagents read it themselves.

### 3. Verify every critical (you, not the subagents)

```sh
node $S/verdict.mjs triage
```

For each pending critical, open the file at the line and check the claim against the actual
code and against `severity.md`. Then choose:

```sh
node $S/verdict.mjs resolve --id <id> --confirm
node $S/verdict.mjs resolve --id <id> --downgrade high --reason "<why this is not critical>"
```

Only **confirmed** criticals block. Downgrade when the line isn't in the diff, the claim is
wrong, it is a known deviation the diff doesn't deepen, or it is taste. `write` refuses to run
while any critical is untriaged.

### 4. Write the verdict and report

```sh
node $S/verdict.mjs write
```

This writes `.devdigest/cache/pr-self-review/verdicts/<fingerprint>.json` and `latest.json`
(gitignored) and prints the report. Blocking criticals come first, grouped by file with
`file:line`, then high/medium/low. Relay the report to the user. For `BLOCK`, say plainly that the
PR cannot be opened until the listed criticals are fixed. Offer to fix them; after fixing, rerun
from step 1.

## Waivers (user only)

A confirmed critical can be waived **only when the user explicitly says so and gives a reason**
("this is a false positive because …", "ship it anyway, because …"):

```sh
node $S/verdict.mjs waive --id <id> --reason "<the user's reason, in their words>"
```

**Never waive on your own**: not to get past the gate, not because a finding "looks minor",
not because the user asked to "just open the PR". In that last case, show the blocking list and
ask. The reason is stored in the verdict.

## When the gate blocks a command

`gh pr create`, `gh pr merge` or `git push` was denied with `pr-self-review gate: …`:
- *"no self-review verdict for the current changes"* → run this workflow, then retry the
  command if the verdict is `PASS`.
- *"BLOCK — N critical finding(s)"* → show them to the user and offer to fix. Don't retry the
  command in a loop or rephrase it to get past the matcher.

## Limits

- The gate is local. It can be bypassed with `git push --no-verify`, with a push from a terminal
  that has no hook installed, or by merging in the GitHub UI. The hard guarantee needs a required
  status check in CI, which this skill does not provide.
- Hermetic tests only by default. `*.it.test.ts` need Docker; pass `--it` to include them.
- Deleted files, lockfiles, and generated migrations go to no reviewer. Diff rules still see
  them. Vendored source is reviewed using the same routing rules as application source.

## Files

- `routing.md`: skill → globs (parsed by `route.mjs`). Edit it when a skill is added.
- `severity.md`: the one severity scale.
- `scripts/prepare.mjs`: stage 1 (runs `diff-rules.mjs`, `checks.mjs`, `route.mjs`).
- `scripts/verdict.mjs`: triage, resolve, write, waive, show.
- `scripts/gate.mjs`: the hook (`--hook` for Claude Code, `--git` for pre-push).
