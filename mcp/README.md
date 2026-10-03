# `@devdigest/mcp` — DevDigest local MCP server

A local, **stdio-only** [Model Context Protocol](https://modelcontextprotocol.io) server that lets
Claude Code drive DevDigest from chat: list reviewer agents, read extracted conventions, start a
review of a PR, and read its findings. It is a thin adapter over the Fastify API on `:3001` — no
database access, no business logic. The engine that produces reviews lives in `reviewer-core/`; this
package only shapes and fences the API's responses for a model.

## Install and run

The server has its own `package.json` and `package-lock.json` (npm, like `reviewer-core/` and
`e2e/` — never `pnpm` here).

```sh
cd mcp && npm install
```

Claude Code launches it for you — see [`.mcp.json`](../.mcp.json) at the repo root:

```json
{
  "mcpServers": {
    "devdigest": { "command": "npm", "args": ["--prefix", "mcp", "run", "-s", "start"] }
  }
}
```

`npm --prefix mcp run -s start` runs `tsx --tsconfig tsconfig.json src/index.ts` over **stdio** —
there is no port to open and no process to keep running yourself. Claude Code spawns one instance
per session and tears it down when the session ends. Toggle it on/off with `/mcp` inside Claude
Code; `claude mcp list` (from the repo root) shows whether `devdigest` is registered.

The DevDigest API must be running first (`./scripts/dev.sh`, or `cd server && pnpm dev`) — tools
are listed even when it's down, but every call fails with an actionable `isError` until it's up.

```sh
cd mcp
npm run typecheck   # tsc --noEmit — no build step, TS source is run directly via tsx
npm test            # vitest, hermetic — FakeDevDigestApi, no network, no DB
npm run inspect      # MCP Inspector — see "Inspecting the server" below
```

## Tools

Registered in this fixed order (pinned by `test/tools-list.test.ts`); `get_blast_radius` is
always on and always last.

| Tool | Input | Returns | Annotations |
|---|---|---|---|
| `list_agents` | *(none)* | `{agents: [{id, name, description≤200, model, enabled, skillCount}]}` | RO · non-destructive · idempotent · closed-world |
| `get_conventions` | `repo` (`owner/name`), `status` = `accepted`\|`pending`\|`all` (default `accepted`), `limit` (default 30, max 100), `response_format` = `concise`\|`detailed` | Extracted conventions for the repo, fenced as `<untrusted_data>` | RO · non-destructive · idempotent · closed-world |
| `run_agent_on_pr` | `agentId` (uuid), `repo` (`owner/name`), `prNumber` | `{runId, status, reused, agentName, repo, prNumber, next}` — returns immediately with `status:"running"` | not RO · non-destructive · not idempotent · **open-world** |
| `get_findings` | `repo` (`owner/name`), `prNumber`, `minSeverity?`, `limit` (per review; default 20, max 50), `response_format` | PR-level: the latest review per agent (`verdict`, `score`, `cost_usd`, `total_findings`, `findings`, `truncated`), top-level `total_findings`/`counts` (summed), `in_progress[]`, `failed[]`, `hint`. Fenced as `<untrusted_data>` | RO · non-destructive · idempotent · closed-world |
| `get_blast_radius` | `repo`, `prNumber` | `{repo, prNumber, summary, degraded, reason, changedSymbols[], downstream[{symbol, callers[], endpoints[], crons[]}], hint?}` — changed symbols and callers as flat strings, fenced as `<untrusted_data>` | RO · non-destructive · idempotent · closed-world |

`run_agent_on_pr` is the one write. Everything else is read-only, which is why it's the only tool
marked `openWorldHint: true` (it triggers a review, an external-cost side effect) — see the
annotation matrix asserted in `test/tools-list.test.ts`.

## Flow

```
list_agents                              # pick an agentId
  → run_agent_on_pr "<owner>/<repo>" #N   # returns {runId, status:"running", reused}
    → get_findings "<owner>/<repo>" #N   # poll every ~15s while in_progress is non-empty
```

A second `run_agent_on_pr` call for the same agent + PR while a run is still `running` returns
`reused: true` instead of starting a duplicate (server-side dedupe on the `running` row; see
`server/docs/run-lifecycle-and-cost.md`). A PR that hasn't been imported into DevDigest yet fails
with `isError` listing the repos that *are* imported — there is no auto-sync from GitHub.

`get_conventions` reads whatever DevDigest already extracted; it never triggers a new scan.

## Env vars

Read only in `src/config.ts` — no other module touches `process.env` (package rule).

| Var | Default | Meaning |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Base URL of the Fastify API. Must be `http:` or `https:`. |

Request timeout is a fixed 15s (`REQUEST_TIMEOUT_MS` in `src/config.ts`).

## Error messages

Every tool returns `isError: true` with actionable text instead of a protocol-level error — only a
malformed call (bad schema) becomes one. `src/api/errors.ts#ApiErrorKind` drives one hint per kind
(`src/format/result.ts#apiErrorResult`), plus a tool-specific hint layered on top where useful:

| Situation | `isError` text |
|---|---|
| API not running | `DevDigest API is not reachable at <url>. Start the API with ./scripts/dev.sh, then retry.` |
| Repo not imported | `Repo "<owner>/<name>" is not imported. Imported repos: <list>.` (or "No repos are imported yet…") |
| Agent/PR not found (`run_agent_on_pr`) | …plus `Call list_agents to check the agent id, or import this PR in DevDigest first.` |
| PR not found (`get_blast_radius`) | `PR #<N> is not in DevDigest for <owner>/<name>.` plus `Open this PR in DevDigest once so its files are imported, then retry.` |
| Rate limited | …plus `Wait a moment before retrying / starting another run.` |
| `get_findings` with runs still going | No error — `in_progress: [{agent_name}]`, `hint: "N run(s) still in progress — call get_findings again in ~15s."` |
| `get_findings` after a failed run (no newer review) | `failed: [{agent_name, error}]`, `hint: "Run failed (<error>) — check the provider key and retry."` |
| `get_findings` on a PR with no reviews | `hint: "No reviews yet — start one with run_agent_on_pr."` |
| PR not found (`get_findings`) | Same message and hint as `get_blast_radius` |
| Response too large for one page | `hint: "…narrow with minSeverity or a smaller limit."`, `truncated: true` |
| `get_blast_radius` degraded data | `hint: "…resync the repo in DevDigest to rebuild the index, then retry."` |
| `get_blast_radius` zero changed symbols | `hint: "…open this PR in DevDigest once so its files are imported, then retry."` |

PR/LLM-derived content (conventions, findings) is never trusted as instructions: it is wrapped in
`<untrusted_data>…</untrusted_data>` by `src/format/untrusted.ts#wrapUntrustedJson`, and any literal
closing tag inside the payload is escaped so a hostile PR title can't break the fence. `Agent.system_prompt`
and `Repo.clone_path` are never returned by any tool.

## Token-budget rules

MCP tool descriptions get sent to the model on every session start, so `tools/list` has a hard
budget, pinned by `test/tools-list.test.ts`:

- `JSON.stringify(tools).length ≤ 8000` for all 5 tools (`get_blast_radius` is always registered,
  no flag) — **measured 7313 chars (~1828 tokens at chars/4)**. The budget was raised from an
  earlier 5000 (chars/4-token trade-off) to 7000, then to 8000 once `get_blast_radius` became a
  real, always-on tool instead of an opt-in stub (`mcp/INSIGHTS.md`).
- Every tool `description` is ≤300 chars, starts with a verb, and says what to call next.
- Schemas are flat inline zod v3 shapes — no `$defs`/`$ref`; no `$schema` meta either (stripped by
  `src/tools/_register.ts#stripJsonSchemaMetaFromToolsList`, since the SDK always emits it and
  `zod-to-json-schema` has no option to suppress it — see `mcp/INSIGHTS.md`).
- No tool has a `title`; only the key params (`repo`, `agentId`, `prNumber`, `minSeverity`,
  `response_format`) carry a short `.describe()`.
- A no-param tool (`list_agents`) reports `{type:"object", additionalProperties:false}`.
- Server `instructions` (the one place the end-to-end flow is spelled out) stays ≤600 chars.
- Tool names are snake_case with no `devdigest_` prefix (the server name is already the namespace).

## Design decisions

- **Five separate tools, no facade tool.** A single dispatch tool (`devdigest(action, …)`) pays off
  for many *homogeneous* actions with the same shape; these five differ in input, side effects, and
  annotations (four read-only, one open-world write). Consolidation happens *inside* tools instead —
  `get_findings` folds every agent's verdict + score + findings for a PR (plus in-progress/failed runs) into one call, with options as params
  (`response_format`, `minSeverity`, `limit`). **Revisit trigger:** more than ~8 tools, or
  several homogeneous repo-intel reads that would suit one parameterized tool.
- **No MCP resources in v1.** Severity meaning is one `.describe()` on `findings[].severity`
  (`'CRITICAL > WARNING > SUGGESTION'`); the end-to-end flow lives in the server `instructions`
  string instead of a resource.
- **PRs are addressed as `repo: "owner/name"` + `prNumber`**, never as internal ids. `resolveRepo`
  (`src/tools/resolve-repo.ts`) turns `repo` into an id via `GET /repos`; the server resolves
  `(repo_id, number)` to the PR's uuid.
- **Dedupe is server-side.** An existing `running` run for the same agent + PR makes `run_agent_on_pr`
  return `reused: true` instead of the MCP layer tracking in-flight runs itself.

See `docs/plans/mcp-server-plan.md` for the full plan (three prior phases) and `mcp/INSIGHTS.md` for
the non-obvious implementation lessons (SDK generics workaround, `$schema` stripping, the exact
token-budget history).

## Inspecting the server

```sh
npm run inspect   # npx -y @modelcontextprotocol/inspector tsx --tsconfig tsconfig.json src/index.ts
```

This opens the MCP Inspector's web UI against the real stdio server — use it to eyeball `tools/list`
output (order, schemas, annotations) and try a `tools/call` by hand.

The Inspector's `--cli` mode did **not** work in this sandbox (both v1 `npx @modelcontextprotocol/inspector`
and v2 `@latest`, which also needs Node ≥22.19 — see `mcp/INSIGHTS.md`). If you need a scriptable,
non-interactive check instead of the web UI, drive the server directly over stdio with a small
newline-delimited JSON-RPC client (`initialize` → `notifications/initialized` → `tools/list` →
`tools/call`, one JSON object per line, no `Content-Length` framing) — this is how the token-budget
and `$schema`-stripping numbers in this README were verified against the real process rather than
only the in-memory transport used by the test suite.
