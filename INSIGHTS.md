# repo-wide insights

Non-obvious lessons learned while working across the repo — `scripts/`,
`docker-compose.yml`, `.github/` CI, and anything that truly spans packages.
Package-specific lessons go in that package's own `INSIGHTS.md`. Skip routine
changes; only record what would otherwise get re-discovered the hard way.

## Gotchas & recurring errors

### 2026-09-19 · The pr-self-review hook denies any Bash command whose text contains `gh pr create`/`gh pr merge`/`git push`
- **Context:** `.claude/settings.json` PreToolUse hook → `.claude/skills/pr-self-review/scripts/gate.mjs --hook`, run on every Bash call in Claude Code.
- **Insight:** The gate regex-matches the raw command string, not the parsed argv. So `echo`, heredocs, test fixtures or `grep` patterns that contain those words are blocked with "no self-review verdict" even though nothing gets pushed.
- **Do:** When a command only needs to *mention* these words (tests, fixtures), build the string at runtime (`"git "+"push"`) or keep it in a file. NEVER edit the matcher or the settings to get past the gate; run /pr-self-review instead.
- **Evidence:** `GATED` regex in `.claude/skills/pr-self-review/scripts/gate.mjs`; reproduced by piping a hook JSON that contains `gh pr create` through `echo`.
