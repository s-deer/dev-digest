# DevDigest subagents

The spec-driven development agents (`researcher`, `spec-creator`, `implementation-planner`,
`implementer`, `test-writer`, `architecture-reviewer`, `plan-verifier`) are no longer kept in
this repository. They come from the
[`dev-digest-ai-marketplace`](https://github.com/s-deer/dev-digest-ai-marketplace) plugins and are
called by their namespaced name:

| Plugin | Agents |
| --- | --- |
| `sdd-engineering` | `sdd-engineering:spec-creator`, `sdd-engineering:implementation-planner`, `sdd-engineering:implementer`, `sdd-engineering:test-writer`, `sdd-engineering:plan-verifier` |
| `architecture-review` | `architecture-review:architecture-reviewer` |
| `research-tools` | `research-tools:researcher` |

See the plugin READMEs for roles, the typical flow and permissions. Do not copy those agents back
here.

## Project agents

| Agent | Responsibility | Tools | Model | Preloaded skills |
| --- | --- | --- | --- | --- |
| [`doc-writer`](doc-writer.md) | Document an implemented feature in the right place, with diagrams grounded in code | Read, Grep, Glob, Edit, Write, Bash | sonnet | `engineering-paved-path:mermaid-diagram`, `sdd-engineering:engineering-insights` |

`doc-writer` runs once a feature is verified (after `sdd-engineering:plan-verifier`), so it
documents code that will ship.

| Can | Cannot |
| --- | --- |
| Edit `<pkg>/docs/**`, package and root `README.md`, `server/src/modules/*/README.md`, `TESTING.md`, `docs/agent-prompts/*.md`, one "Read when" line in `<pkg>/AGENTS.md`; write INSIGHTS through `sdd-engineering:engineering-insights` | Edit source, tests, `specs/`, `tasks/`, `docs/skills-library/`, `.claude/`; edit a `CLAUDE.md` symlink; document a plan as if it were implemented |

Write scope is enforced by prompt rules plus a `git status --short` self-check; frontmatter cannot
restrict paths.
