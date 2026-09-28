# MCP server testing (`@devdigest/mcp`): instructions for a new session

> **Your role:** QA for the local stdio MCP server DevDigest.
> **Your goal:** confirm that the implementation matches the plan and works end to end, then write a report.
> **Do not fix code.** If you find a bug, record it in the report with reproduction steps and evidence, and keep going. Code changes happen only when the user explicitly asks for them.

## 0. Context: read first

1. `docs/plans/mcp-server-plan.md` — the plan: phases, decisions, acceptance criteria.
2. `mcp/README.md` — tools, the flow, errors, the token budget.
3. `mcp/INSIGHTS.md` — known SDK quirks. It covers the `$schema` strip, the `_register.ts` wrapper, the fact that the Inspector `--cli` mode doesn't work in this environment, and how to run a stdio smoke test.
4. `server/docs/run-lifecycle-and-cost.md` — run statuses and cost.

What you are testing:
- A stdio process in `mcp/`, started by Claude Code through `.mcp.json` (`npm --prefix mcp run -s start`). It listens on no ports.
- A thin HTTP adapter over the API on `:3001`.
- 4 tools: `list_agents`, `get_conventions`, `run_agent_on_pr`, `get_findings`.
- `get_blast_radius`, which appears only when `DEVDIGEST_MCP_ENABLE_BLAST_RADIUS=1` is set.
- The new server routes `POST /runs` and `GET /runs/:id`.

## Rules

- `mcp/` uses **npm**. `server/` and `client/` use **pnpm**. Don't mix them.
- **Never** run `docker compose down -v`: it deletes the `devdigest_pgdata` volume.
- Don't read or edit `server/clones/**`. Exclude it from every grep/glob.
- Don't commit anything. Don't edit files in the repo. Put temporary scripts in the scratchpad or in `/tmp`.
- After testing, stop the API process on `:3001` and leave Postgres running.
- Demo data from the seed: repo `acme/payments-api`, PR `#482` (`server/src/db/seed.ts`).

---

## Level 1: static checks and automated tests (no API)

```sh
cd mcp && npm ci && npm run typecheck && npm test
cd ../server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'
cd ../server && pnpm exec vitest run test/runs-api.it.test.ts test/reviews.it.test.ts   # needs Docker
cd ../client && pnpm typecheck
cd .. && diff server/src/vendor/shared/contracts/review-api.ts client/src/vendor/shared/contracts/review-api.ts && echo IDENTICAL
```

Expected:
- `mcp`: all tests green (about 61), including `test/tools-list.test.ts`, which checks order, budget, and the absence of `$schema`.
- `server`: typecheck is clean and the unit lane is green.
- The it-tests pass, or are SKIPPED if Docker isn't available. Write down which of the two happened.
- The two contract copies are identical.

Onion architecture check (only the known deviations may show up; `start-run.ts` must not show up at all):
```sh
grep -rnE "from 'drizzle-orm'|db/schema" server/src/modules/reviews --include=routes.ts --include=service.ts --include=start-run.ts --include=helpers.ts
grep -rn "from 'fastify'" server/src/modules/reviews --include=service.ts --include=start-run.ts --include=repository.ts
grep -n "Container" server/src/modules/reviews/start-run.ts
```

Package rules for `mcp/`:
```sh
cd mcp
grep -rn "process\.env" src | grep -v "src/config.ts"           # must be empty
grep -rn "fetch(" src | grep -v "src/api/http.ts"                # must be empty
grep -rn "console\.log" src                                       # must be empty (stdout = protocol)
grep -rnE "listen\(|http\.createServer" src                       # must be empty (no ports)
grep -rnE "from '\.\./api/http|from '\.\./config" src/tools       # must be empty (tools see only the port)
```

## Level 2: server API (curl)

Start the stack **in the background** (API only, no client):
```sh
./scripts/dev.sh --no-client      # in background; wait until curl localhost:3001/health returns {"status":"ok"}
```

```sh
curl -s localhost:3001/health
curl -s localhost:3001/repos  | jq '.[] | {id, full_name}'        # take the id of acme/payments-api
curl -s localhost:3001/agents | jq '.[] | {id, name, enabled}'     # take the id of an enabled agent
```

Check `POST /runs` / `GET /runs/:id`:

| # | Request | Expected |
|---|---|---|
| 2.1 | `POST /runs {"repo_id":"<repo>","pr_number":482,"agent_id":"<agent>"}` | **201**, `status:"running"`, `reused:false`, `run_id` present |
| 2.2 | The same request again, right away (while the first one is still `running`) | **200**, `reused:true`, same `run_id` |
| 2.3 | `GET /runs/<run_id>`, polled every ~10s | `status` goes `running` → `done` or `failed`. On `done`, `cost_usd` is a **number** (or null), never a string, and `findings` is an array |
| 2.4 | `POST /runs` with `pr_number: 99999` | **404**, `error.code == "not_found"`, message mentions importing the PR |
| 2.5 | `POST /runs` with `pr_number: "x"` or an extra field | **422** (validation) |
| 2.6 | `GET /runs/00000000-0000-0000-0000-000000000000` | **404** |
| 2.7 | `GET /runs/not-a-uuid` | **422** |

Example:
```sh
curl -s -XPOST localhost:3001/runs -H 'content-type: application/json' \
  -d '{"repo_id":"<repo>","pr_number":482,"agent_id":"<agent>"}' -w '\nHTTP %{http_code}\n'
```

> If a run ends up `failed` with a provider error, there's no LLM key in `~/.devdigest/secrets.json`. That's not an MCP bug. Record it and check the `hint` in `get_findings` for the failed status (see 3.x).

## Level 3: MCP over real stdio (scripted, no Claude Code)

The Inspector `--cli` mode doesn't work here (see `mcp/INSIGHTS.md`), so write a small Node script **in the scratchpad**. It should:
1. Spawn `npm --prefix <repo>/mcp run -s start` with `cwd` = the repo root and `stdio: ['pipe','pipe','pipe']`.
2. Send newline-delimited JSON-RPC: one JSON object per line, **no** `Content-Length`. Send `initialize` (`protocolVersion: "2025-06-18"`, `capabilities: {}`, `clientInfo`), then `notifications/initialized`, then `tools/list`, then `tools/call`.
3. Read stdout line by line and match responses by `id`.
4. Print stderr separately. It must contain only JSON log lines, and stdout must contain nothing but JSON-RPC.

Skeleton:
```js
import { spawn } from 'node:child_process';
import readline from 'node:readline';
const env = { ...process.env /*, DEVDIGEST_MCP_ENABLE_BLAST_RADIUS: '1' */ };
const p = spawn('npm', ['--prefix', 'mcp', 'run', '-s', 'start'], { cwd: REPO_ROOT, env });
const pending = new Map(); let id = 0;
readline.createInterface({ input: p.stdout }).on('line', (l) => {
  const m = JSON.parse(l);                       // any non-JSON line on stdout is itself a bug
  pending.get(m.id)?.(m); pending.delete(m.id);
});
p.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
const rpc = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r);
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n'); });
const notify = (method) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
// await rpc('initialize', {...}); notify('notifications/initialized'); const tools = await rpc('tools/list', {}); ...
```

### 3A. `tools/list` and initialize (API may be down)

| # | Check | Expected |
|---|---|---|
| 3.1 | Tool order | `list_agents, get_conventions, run_agent_on_pr, get_findings` |
| 3.2 | `get_blast_radius` without the flag | absent |
| 3.3 | `JSON.stringify(result.tools).length` | ≤ 7000 (about 5800 expected). Record the number and ≈ tokens (chars/4) |
| 3.4 | No `"$schema"`, `"$defs"` or `"$ref"` in the serialized tools | none |
| 3.5 | `list_agents.inputSchema` | `{type:"object", ..., additionalProperties:false}` |
| 3.6 | Descriptions | each ≤300 chars, verb first, and says what to call next |
| 3.7 | Annotations | `run_agent_on_pr`: readOnly=false, destructive=false, idempotent=false, openWorld=true. The rest: readOnly=true, destructive=false, idempotent=true, openWorld=false |
| 3.8 | `initialize` → `result.instructions` | present, ≤600 chars, describes the flow `list_agents → run_agent_on_pr → get_findings` and warns about untrusted data |
| 3.9 | `serverInfo.name` | `devdigest` |

### 3B. Happy path (API running)

| # | Call | Expected |
|---|---|---|
| 3.10 | `list_agents {}` | `structuredContent.agents[]` has `id,name,description,provider,model,enabled,skillCount`. **No `system_prompt`** anywhere in the response. The text block holds the same JSON |
| 3.11 | `get_conventions {repo:"acme/payments-api"}` | only `accepted` conventions. The text starts with the untrusted-data notice and is wrapped in `<untrusted_data …>…</untrusted_data>` |
| 3.12 | `get_conventions {…, status:"all", response_format:"detailed"}` | more items, and the detailed fields (rationale, evidence snippet) are present |
| 3.13 | `run_agent_on_pr {agentId, repo:"acme/payments-api", prNumber:482}` | right away `runId`, `status:"running"`, `reused:false`, plus `next` telling you to call `get_findings` |
| 3.14 | The same call again, immediately | same `runId`, `reused:true` |
| 3.15 | `get_findings {runId}` while running | `status:"running"`, `findings:[]`, `hint` says to call again in ~15s |
| 3.16 | `get_findings {runId}` after `done` | `status:"done"`, `costUsd` is a number or null, `verdict`, `counts`, concise findings with `rationale` ≤240 chars, output in `<untrusted_data>` |
| 3.17 | `get_findings {runId, minSeverity:"CRITICAL"}` / `{limit:1}` → then `{cursor: nextCursor}` | filtering and pagination work; `nextCursor` disappears on the last page |
| 3.18 | `get_findings {runId, response_format:"detailed"}` | full rationale and suggestion are present |
| 3.19 | Response sizes | not a single response is anywhere near 10k tokens (Claude Code's warning threshold). Record the largest one |

### 3C. Errors and negative cases (a tool must return `isError:true` with actionable text, not crash)

| # | Call | Expected |
|---|---|---|
| 3.20 | `get_conventions {repo:"nope/nope"}` | `isError`, lists the imported repos |
| 3.21 | `run_agent_on_pr` with a random uuid as `agentId` | `isError`, hint "call list_agents…" |
| 3.22 | `run_agent_on_pr {…, prNumber: 99999}` | `isError`, hint about importing the PR |
| 3.23 | `get_findings` with a random uuid | `isError`, hint about the runId |
| 3.24 | `get_findings {runId, cursor:"abc"}` | `isError` "Invalid cursor…" |
| 3.25 | Schema violations: `repo:"bad"`, `prNumber:-1`, `agentId:"x"`, `limit:1000` | Record exactly how the SDK responds: a JSON-RPC error or `isError`. Either is fine, as long as the server doesn't crash and keeps answering later calls |
| 3.26 | **Stop the API** (kill the process on :3001), then call `list_agents` and `get_conventions` | `isError` with the text `DevDigest API is not reachable at http://localhost:3001. Start the API with ./scripts/dev.sh…`. The hint appears **once**. `tools/list` still works |
| 3.27 | `DEVDIGEST_API_URL=file:///x` at startup | the process exits with a clear error on stderr and doesn't hang |
| 3.28 | A run in `failed` state (if you got one) | `hint` contains the error text and "check the provider key" |

### 3D. Blast-radius flag

| # | Check | Expected |
|---|---|---|
| 3.29 | Start with `DEVDIGEST_MCP_ENABLE_BLAST_RADIUS=1` → `tools/list` | 5 tools, `get_blast_radius` **last**, still no `$schema` |
| 3.30 | `get_blast_radius {repo:"acme/payments-api", prNumber:482}` | `isError:true`, "not implemented yet. Use get_findings…" |

### 3E. Security (optional but desirable)

- 3.31 **Untrusted-data fence:** in the tests or through a fake, make sure a string containing `</untrusted_data>` inside a finding can't close the fence (`mcp/test/format.test.ts` should cover this; confirm the test exists).
- 3.32 **No leaks:** grep every stdio response for `system_prompt`, `clone_path`, `api_key`, `secret`, `sk-`. All must be absent.
- 3.33 **stdout hygiene:** every stdout line across the whole run parsed as JSON.

## Level 4: inside Claude Code (this very session, interactively)

This session was started in the repo, so Claude Code should have offered to approve the `devdigest` server from `.mcp.json`.

1. Ask the user to run `claude mcp list` (or `/mcp`) and confirm that `devdigest` is **connected**. If it shows *Pending approval*, ask them to approve it. That can't be done headlessly.
2. Ask the user to run `/context` and send you the MCP tools section. The `mcp__devdigest__*` tools should show as deferred / loaded on demand (≈0 tokens at startup). Record the number.
3. Call the tools yourself through `mcp__devdigest__*`. If they're deferred, load them first with `ToolSearch` (`select:mcp__devdigest__list_agents,…`). Run the scenario:
   - "Show the DevDigest agents."
   - "Run agent <name> on acme/payments-api PR #482."
   - "Show the findings of that run", repeating while `running`.
   - "Show only CRITICAL" / "the next page".
   - "Show the accepted conventions of acme/payments-api."
   Check that a model (you) can understand from the descriptions alone which parameters to pass and what to call next, **without** reading the code. Record any spot where you had to guess.
4. Ask the user to turn `devdigest` off and back on in `/mcp`, and confirm that the process restarts (the tools work again).

## Cleanup

- Stop the API: `lsof -ti :3001 | xargs kill` (or Ctrl-C in the `dev.sh` session). Leave Postgres running.
- Delete the temporary scripts from the scratchpad or `/tmp`.
- `git status --short` must be the same as before testing started. Record it if not.

## Report format

Reply in one message:

1. **Summary:** PASS / PASS with remarks / FAIL, in one line.
2. **Table of every check** (IDs 1.x, 2.x, 3.x, 4.x): `ID | check | PASS/FAIL/SKIPPED | evidence (command + short excerpt of the output)`.
3. **Measurements:**
   - `tools/list` size in chars and ≈tokens, with the flag off and on.
   - Size of the largest response.
   - Token figure from `/context`.
   - How long a run took to go from `running` to `done`.
4. **Bugs found:** for each one give reproduction steps, expected vs actual, the file:line where it probably lives, and severity (critical/major/minor). Don't fix them.
5. **UX observations for the model:** where a tool description or hint was unclear.
6. **What couldn't be checked** and why (no Docker, no LLM key, the approval needs the user, etc.).
