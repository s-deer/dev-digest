# Development Plan: DevDigest local MCP server (`@devdigest/mcp`)

## Context
We want Claude Code to drive DevDigest from chat: list reviewer agents, start a review of a PR, read a run's findings, and read repo conventions. The fifth tool (blast radius) is a stub for now. The server is **local only (stdio)** and built on the agreed MCP best practices: cheap at session start, concise responses, actionable errors, and untrusted PR/LLM content fenced as data. On approval this plan is copied to `docs/plans/mcp-server-plan.md`.

**Phases are logical, vertical slices.** Each phase ends with something that works end to end and can be checked in Claude Code. Phases run sequentially, with one implementer subagent per phase.

| Phase | Outcome | Tools live after it |
|---|---|---|
| 1. Foundation + read-only tools | MCP connects to Claude Code, lists agents, reads conventions | `list_agents`, `get_conventions` |
| 2. Review run flow | Start a review from chat, poll status, read findings | + `run_agent_on_pr`, `get_findings` |
| 3. Token budget + blast-radius stub | Size and schema guarantees pinned by tests; flagged stub | + `get_blast_radius` (flag) |
| 4. Docs, CI, team rollout | Documented, in CI, covered by pr-self-review | — |

### User decisions (fixed)
- New package `mcp/` (`@devdigest/mcp`, **npm**, the same profile as `reviewer-core`: TS source, path aliases, no build). It is a stdio process and a thin HTTP adapter over the Fastify API on :3001. It has no DB access and no business logic.
- `run_agent_on_pr` returns `runId` immediately. Status and findings come through `get_findings(runId)`.
- `get_blast_radius` exists only when `DEVDIGEST_MCP_ENABLE_BLAST_RADIUS=1`.
- A PR that is not imported yet gives `isError` with a hint. There is no auto-sync from GitHub.
- The dedupe race is accepted for v1. There is no unique index and no migration.
- `get_conventions` defaults to `accepted`.
- Add a `mcp/src/**/*.ts` row to pr-self-review `routing.md`.

### Design decisions
- **Five separate tools, no facade tool.** The facade pattern pays off only for many homogeneous actions (Anthropic, code-execution-with-mcp), and our tools differ in inputs, side effects and annotations. Consolidation happens *inside* tools instead:
  - `get_findings` = status + cost + verdict + findings.
  - Options are params (`response_format`, `minSeverity`, `limit`, `cursor`, `status`).
  - **Revisit trigger:** more than ~8 tools, or many homogeneous repo-intel reads.
- **No MCP resources in v1.** Severity meaning goes into one `.describe()`, and the flow goes into the server `instructions`.
- **PRs are addressed as `repo: "owner/name"` + `prNumber`.** MCP resolves repo → id via `GET /repos`, and the server resolves `(repo_id, number)` → PR uuid.
- **Dedupe is server-side:** an existing `running` run for the same agent + PR returns `reused: true`.

### Onion-architecture alignment (review against `.claude/skills/onion-architecture`)
**Verdict: aligned after 3 fixes** (already applied to the steps below).

| # | Finding in the previous draft | Rule | Fix |
|---|---|---|---|
| 1 | The `startRun` use case (dedupe + resolve) was added to `ReviewService`, which takes `Container`. It could only be tested with Postgres. | "New services get narrow dependencies"; "A service test that needs Docker is a layering smell" | A new ring-3 `StartRunUseCase` with the narrow `StartRunDeps` port and a hermetic test with fakes. `ReviewService` only wires and delegates. |
| 2 | Status narrowing ("unknown → failed") lived in the repository mapping. | Domain rules belong in ring 1 as pure functions | `toRunStatus()` in `reviews/helpers.ts` with a unit test. The repository just calls it. |
| 3 | `apiErrorResult` in `mcp/src/format` logged to stderr, which is I/O in a "pure" helper. | Inner rings do no I/O | Formatters stay pure, and logging moves to the `safeHandler` wrapper in `tools/`. |

Already compliant:
- Contracts are added first in both shared copies as a targeted diff.
- Drizzle is only in `repository/*`, and every query is scoped by `workspaceId`.
- DTOs, not rows, come out of the repository.
- Routes are schema → `getContext` → one service call → status.
- `NotFoundError` comes from `platform/errors.ts`.
- There is no cross-module import. The agents repo comes via `container.agentsRepo`, which already exists.
- No new external I/O on the server, so no new adapter, mock or container getter is needed.

Known deviations touched but not deepened:
- `ReviewService(container)`.
- `reviews/helpers.ts` imports row types.

**The `mcp/` package mirrors the onion** (the skill targets `server/`, but the same dependency rule is applied):

| Ring | mcp files | May import |
|---|---|---|
| 1 Domain / pure | `src/format/*` (shaping, truncation, untrusted fence, result builders), shared contract types | `@devdigest/shared` |
| 2 Port | `src/api/port.ts` (`DevDigestApi`), `src/api/errors.ts` (`ApiError`) | ring 1 |
| 3 Application | `src/tools/*` (tool handlers, `resolve-repo`, `_handler.ts`) | rings 1–2, the MCP SDK types |
| 4 Adapters / edge | `src/api/http.ts` (fetch), `src/config.ts` (env), `src/log.ts` (stderr), `src/server.ts` (SDK registration), `src/index.ts` (**composition root**: config → adapter → server → stdio) | everything inward |

Tools never import `http.ts`, `config.ts` or `fetch`. Tests swap the port with `FakeDevDigestApi`, which is the same idea as `ContainerOverrides`.

### Cross-cutting rules (apply in every phase)
- Tool descriptions are ≤300 chars, start with a verb, and say what to call next.
- Schemas are flat inline zod v3 shapes with no `$defs`/`$ref`. A no-param tool uses `{type:object, additionalProperties:false}`.
- `outputSchema` + `structuredContent`, plus the same JSON in a text block.
- Errors come back as `isError:true` with an actionable text. Only malformed requests become protocol errors.
- Package rules:
  - Log to stderr only.
  - `process.env` is read only in `src/config.ts`.
  - `fetch` appears only in `src/api/http.ts`.
  - Tools depend on the `DevDigestApi` port.
- PR/LLM-derived output is wrapped with `wrapUntrustedJson`. `Agent.system_prompt` and `Repo.clone_path` are never returned.
- Skills: `zod`, `typescript-expert`, and `security` for `mcp/`. For server work, add `onion-architecture`, `fastify-best-practices` and `drizzle-orm-patterns`.

---

## Phase 1: Foundation + read-only tools
**Goal:** a working MCP server in Claude Code with the two tools that need **no server changes**.

1. **Scaffold `mcp/`.**
   - `package.json`:
     - `"type": "module"`, node ≥22.
     - Scripts: `start` = `tsx --tsconfig tsconfig.json src/index.ts`, `typecheck`, `test`, `inspect`.
     - Dependencies: `@modelcontextprotocol/sdk@^1.30.1`, `zod@^3.25.76`, `tsx`. Dev dependencies: `typescript`, `vitest`, `@types/node`.
   - `tsconfig.json`: copied from `reviewer-core`, with paths `@devdigest/shared` → `../server/src/vendor/shared` and `zod` → `./node_modules/zod`. It includes `test/**`.
   - `vitest.config.ts`: the same aliases.
2. **Config and logging.**
   - `src/config.ts`: `DEVDIGEST_API_URL` (default `http://localhost:3001`, http(s) only), `DEVDIGEST_MCP_ENABLE_BLAST_RADIUS`, and a 15s timeout.
   - `src/log.ts`: JSON lines to stderr.
3. **API port and adapter.**
   - `src/api/port.ts`: `DevDigestApi` with `listAgents`, `listRepos` and `getConventions`. The run methods are added in Phase 2.
   - `src/api/errors.ts`: `ApiError.kind ∈ unreachable | not_found | validation | rate_limited | server | bad_response`.
   - `src/api/http.ts`: every response is `safeParse`d with the shared schemas. "Not reachable" produces the hint `./scripts/dev.sh`. Bodies are never logged.
4. **Shared plumbing.**
   - `src/format/result.ts`: `okResult`, `errorResult`, `apiErrorResult(err, hints)`. These are **pure, with no logging**. Logging an unexpected error happens in one `safeHandler` wrapper in `src/tools/_handler.ts`.
   - `src/format/untrusted.ts`: `wrapUntrustedJson`, with the closing tag escaped.
   - `src/format/conventions.ts`: `shapeConventions`, concise/detailed, limit default 30 / max 100, fits within `MAX_TEXT_CHARS = 24_000`.
   - `src/tools/resolve-repo.ts`: `owner/name` → id. Unknown repo → `isError` listing the imported repos.
5. **Tools.**
   - `list_agents`: `{}` input. Output `{id, name, description≤200, provider, model, enabled, skillCount}`. Annotations RO/non-destr/idempotent/closed-world.
   - `get_conventions`: `repo`, `status='accepted'|pending|all`, `limit`, `response_format`. The output is wrapped as untrusted. The annotations are read-only.
6. **Server and entry point.**
   - `src/server.ts` `createServer({api, config})`: name `devdigest`, fixed tool order, and `instructions` of ≤600 chars (the typical flow, untrusted-data warning, API requirement).
   - `src/index.ts`: the stdio transport. Tools are listed even when the API is down, and `uncaughtException` is logged to stderr and exits 1.
7. **Register in `.mcp.json`**: `devdigest` → `mcp/node_modules/.bin/tsx --tsconfig mcp/tsconfig.json mcp/src/index.ts`.
8. **Tests** (hermetic; `FakeDevDigestApi` in `test/fakes.ts`; SDK `InMemoryTransport` + `Client`):
   - `config.test.ts`.
   - `http.test.ts` (a stubbed fetch covering every error kind).
   - `format.test.ts` (conventions + untrusted escape).
   - `tools.test.ts` for the two tools (happy path, unreachable API, unknown repo).

**Technical checks to settle here and record in `mcp/INSIGHTS.md`:**
- SDK import paths and the `registerTool` signature with zod v3.
- Whether the SDK emits `$schema` or `additionalProperties:false`.
- Whether `tsx --tsconfig` applies `paths` to files outside `mcp/`.
- The cwd of a project stdio server. If it isn't the repo root, use `npm --prefix mcp run -s start`.

**Done when:**
- `cd mcp && npm run typecheck && npm test` is green.
- `claude mcp list` shows `devdigest` connected.
- In chat, `list_agents` and `get_conventions acme/payments-api` work.
- With the API stopped, both tools give `isError` with the `./scripts/dev.sh` hint.

## Phase 2: Review run flow
**Goal:** start a review from chat and read its results. This touches all three layers: contract → server → MCP.

1. **Contracts first**, in `contracts/review-api.ts` in **both** shared copies with byte-identical text. Don't import `trace.ts`, because it has drifted.
   - `RunStatus` (`running|done|failed|cancelled`).
   - `StartRunBody {repo_id, pr_number, agent_id}.strict()`.
   - `StartRunResponse {run_id, status, reused, pr_id, agent_id, agent_name}`.
   - `RunDetail {run_id, status, error, agent_*, provider, model, pr_*, repo_full_name, ran_at, duration_ms, cost_usd: number|null, score, verdict, summary, findings: FindingRecord[]}`.
2. **Ring 1, pure domain** (`reviews/helpers.ts`, which has no new imports of `db/schema`):
   - `toRunStatus(raw: string | null): RunStatus` narrows the free-text DB status and falls back to `'failed'` for an unknown value. It is used by the repository mapping.
   - Hermetic test `server/test/reviews-run-status.test.ts`.
3. **Ring 2 port + ring 3 use case, a new narrow-deps collaborator** (`reviews/start-run.ts`):
   - Define `interface StartRunDeps { pulls: { getPullByNumber(ws, repoId, n) }; runs: { findRunningRun(ws, prId, agentId) }; agents: { getById(ws, id) }; launch(ws, prId, agent, logger?): Promise<{ run_id: string }> }`, expressed in domain language.
   - `class StartRunUseCase { constructor(deps: StartRunDeps) }` with `execute(ws, {repoId, prNumber, agentId}): Promise<StartRunResponse>`. It does, in order:
     1. Look up the PR. If missing, throw `NotFoundError` with the hint "open the repo's PR list in DevDigest".
     2. Look up the agent. If missing, throw `NotFoundError`.
     3. Call `findRunningRun`. If one exists, return `reused:true`.
     4. Otherwise call `launch` and return `reused:false`.
   - It must not import `Container`, `drizzle-orm`, `db/**` or `fastify`. It takes `StartRunResponse` and `RunStatus` from `@devdigest/shared` and `NotFoundError` from `platform/errors.ts`.
   - Why a separate class: the onion rule says new use cases take **narrow dependencies, not `Container`**, and a service test that needs Docker is a layering smell. Putting this logic into `ReviewService` (which takes `Container`, a known deviation) would make it testable only through an it-test.
   - Hermetic test `server/test/reviews-start-run.test.ts` with in-memory fakes and no Postgres. Cases:
     - PR missing → `NotFoundError`.
     - Agent missing → `NotFoundError`.
     - Running run exists → `reused:true`, and `launch` is never called.
     - Otherwise `launch` is called once and the result has `reused:false`.
4. **Ring 4, repository** (`reviews/repository/*` + `ReviewRepository` facade). Every query is scoped by `workspaceId`, and all of them return DTOs, not rows:
   - `getPullByNumber`.
   - `findRunningRun`, which checks the DB `running` row, not `runBus` (server INSIGHTS).
   - `getRunDetail`: left joins, the review found by `reviews.run_id` with `kind='review'`, `findingRowToDto`, `cost_usd` through `Number()` (server INSIGHTS numeric), and status through `toRunStatus`.
5. **Wiring inside `ReviewService`** (known deviation: it takes `Container`; name it in one line and don't deepen it):
   - `ReviewService` builds `new StartRunUseCase({ pulls: this.repo, runs: this.repo, agents: this.agents, launch: (ws, prId, agent, log) => this.runReview(ws, prId, [agent], log).then(r => r.runs[0]!) })` in its constructor.
   - `startRun(...)` delegates to it.
   - `getRunDetail(ws, id)` delegates to the repository and throws `NotFoundError` when the run is missing.
   - No new `Container` access. There is no change to `container.ts`, because it's not a new cross-module port.
6. **Ring 4, routes** (`reviews/routes.ts`). Each handler is schema → `getContext` → one service call → status:
   - `POST /runs`: `StartRunBody` → `StartRunResponse`. It returns 201, or 200 when `reused` (the status choice is the only branch). Rate limit 10/min.
   - `GET /runs/:id`: `IdParams` → `RunDetail`.
   - No `Schema.parse(req.body)` in the handler: the route schema parses at the boundary.
   - Update `server/README.md` and `server/docs/run-lifecycle-and-cost.md`.
7. **One integration test per workflow**, `server/test/runs-api.it.test.ts`. Mock `github` and `llm.openrouter`. Cases:
   1. 201 → done/failed.
   2. `cost_usd` is never a string.
   3. Dedupe via an inserted `running` row returns 200 with `reused:true`.
   4. A missing PR returns 404.
   5. Bad input returns 422.
   6. An unknown run returns 404.
   7. A run from another workspace returns 404 (tenancy).
8. **Onion checklist gate** (run before calling Phase 2 done; only the known deviations may match):
   ```sh
   grep -rnE "from 'drizzle-orm'|db/schema" server/src/modules/reviews --include=routes.ts --include=service.ts --include=start-run.ts --include=helpers.ts
   grep -rn "from 'fastify'" server/src/modules/reviews --include=service.ts --include=start-run.ts --include=repository.ts
   grep -n "Container" server/src/modules/reviews/start-run.ts   # must be empty
   ```
9. **MCP**: add `startRun` and `getRun` to the port and the HTTP adapter. Add `src/format/findings.ts`:
   - Drop dismissed findings.
   - Count by severity.
   - Filter by `minSeverity`.
   - Sort by severity, then confidence.
   - Offset cursor.
   - concise = rationale ≤240 (`RATIONALE_PREVIEW_MAX`, the same as `findings-read-model.md`); detailed adds the full rationale and a suggestion ≤1000.
   - `fitToBudget`.
10. **Tools.**
   - `run_agent_on_pr`:
     - Input: `agentId` uuid, `repo` regex ≤200, `prNumber` int>0.
     - Returns `{runId, status, reused, agentName, repo, prNumber, next}`.
     - Error hints: not_found → "call list_agents / import the PR"; rate_limited → "wait".
     - Annotations F/F/F/**openWorld T**.
   - `get_findings`:
     - Input: `runId`, `minSeverity?`, `limit=20` (max 50), `cursor?`, `response_format='concise'`.
     - Output: status, costUsd, verdict, counts, findings, nextCursor, truncated, `hint`. The hint for running is "again in ~15s"; for failed it's the error plus "check the provider key"; for truncated it says how to narrow.
     - The output is wrapped as untrusted. The annotations are read-only.
11. **Tests**: `tools.test.ts` + `format.test.ts` for findings (paging, severity filter, budget truncation, running/failed hints, reused passthrough, 404s).

**Done when:**
- Server `pnpm typecheck`, the unit lane (including `reviews-start-run` and `reviews-run-status`) and the it-tests `runs-api` + `reviews` pass.
- The onion checklist gate (step 8) shows no new hits.
- MCP tests pass.
- `diff` of the two shared `review-api.ts` files prints nothing.
- In chat: `list_agents` → `run_agent_on_pr acme/payments-api #482` → `get_findings` until done. A second start returns `reused:true`, and findings sit in `<untrusted_data>`.

## Phase 3: Token budget + blast-radius stub
**Goal:** keep the "cheap at session start" promise with tests, and add the flagged stub.

1. **`get_blast_radius`**, registered **only** with the flag and always last. Input `repo`, `prNumber`. It always returns `isError`: "not implemented yet; use get_findings". Annotations read-only.
2. **`test/tools-list.test.ts`** pins the budget:
   - Exact tool order.
   - The stub is absent without the flag and last with it.
   - `JSON.stringify(tools).length ≤ 7000` (flag off), with the actual number recorded. This was raised from 5000 by the user's decision: at 5000 all tool/param descriptions had to be stripped, which costs model accuracy for about 300 tokens of savings. Keep verb-first tool descriptions with the next step, and short `.describe()` on key params (`repo`, `agentId`, `runId`, `prNumber`, `minSeverity`, `cursor`).
   - Every description ≤300 chars.
   - No `$schema`, `$defs` or `$ref`.
   - `list_agents` input is `additionalProperties:false`.
   - Annotations match the matrix below.
   - `instructions` ≤600 chars.
   - snake_case names without a `devdigest_` prefix.
3. Fix whatever the test exposes. For example, if the SDK emits `$schema`, apply the fallback settled in Phase 1.

| Tool | readOnly | destructive | idempotent | openWorld |
|---|---|---|---|---|
| list_agents, get_findings, get_conventions, get_blast_radius | T | F | T | F |
| run_agent_on_pr | F | F | F | T |

**Done when:**
- The budget test is green.
- `npm run inspect` shows the right order and annotations, and no `$schema`.
- `/context` in Claude Code shows the `mcp__devdigest__*` tools as deferred, and the token figure is recorded in `mcp/README.md`.
- With the flag set, the stub appears and returns `isError`.

## Phase 4: Docs, CI, team rollout
1. `mcp/README.md`:
   - Install and run.
   - Tools table.
   - Flow.
   - Env vars.
   - Error messages.
   - Token-budget rules.
   - Design decisions (the facade trade-off and revisit trigger).
   - `npm run inspect`.
2. `mcp/AGENTS.md` + `CLAUDE.md` symlink, with the package rules from "Cross-cutting". Also: new data means a new API route, contracts-first.
3. `mcp/INSIGHTS.md` (entries from Phases 1–3) and `mcp/specs/README.md`, which points to the plan.
4. `.github/workflows/mcp.yml`, copied from `reviewer-core.yml`: paths `mcp/**` + `server/src/vendor/shared/**`; steps `npm ci`, typecheck, test.
5. Root `AGENTS.md`:
   - Commands row.
   - Where-things-live row.
   - Add `mcp/` to the npm list.
   - Naming: `mcp/` → `@devdigest/mcp`.
   - Read-when entry.
6. Root `README.md` package and CI tables; `TESTING.md` suite map and a short mcp paragraph.
7. `.claude/skills/pr-self-review/routing.md`: `mcp/src/**/*.ts` → zod, security, typescript-expert.

**Done when:**
- `.mcp.json` is valid JSON.
- `test -L mcp/CLAUDE.md` passes.
- The root docs mention `mcp/`.
- The workflow references `mcp/package-lock.json`.
- `/pr-self-review` routes `mcp/src` files.

---

## Out of scope
HTTP transport, auth, real blast radius, MCP Tasks, progress notifications, resources/prompts, UI changes, e2e browser flows, PR auto-sync from GitHub, and a DB-level dedupe index.
