# Intent Layer (L03): deriving why a PR exists

A shared pre-work step in every review run that infers **why** a PR exists —
its intent, stated in/out of scope, change type, and confidence — from PR
metadata, linked issues, and plan/spec docs, then hands that to every agent so
findings can be judged against scope, not just against the diff. Request/
response shapes are in [`../README.md`](../README.md) ("API map"); the
lifecycle it plugs into is in
[`run-lifecycle-and-cost.md`](run-lifecycle-and-cost.md). Module code lives in
`src/modules/intent/{constants,domain,prompt,repository,helpers,service,routes}.ts`.

## Data sources and caps

`IntentService.ensure` (`src/modules/intent/service.ts:73`) gathers evidence
before calling the LLM. Limits come from `src/modules/intent/constants.ts:1-30`:

| Source | Where it comes from | Fetched via | Cap |
| --- | --- | --- | --- |
| Title, branch | `pull_requests.title` / `.branch` | — | — |
| Description | `pull_requests.body`; if `null`, fetched once via `GitHubClient.getPullRequest` and persisted back (`service.ts:84-96`) | GitHub API | `DESCRIPTION_MAX_CHARS` = 4 000 chars |
| Linked issues | Closing keywords, `#N`, `owner/repo#N`, `github.com/…/issues/N` — same repo only (`domain.ts:extractIssueRefs`, `:58-73`) | `GitHubClient.getIssue`, one try/catch per issue (`service.ts:126-141`) | `MAX_ISSUES` = 2, `ISSUE_BODY_MAX_CHARS` = 6 000 each |
| Plan / spec docs | Markdown links, backticks, bare `*.md`-like tokens, same-repo `blob/<ref>/<path>` links, and PR-changed files matching `DOC_PATH_HINT`/`DOC_BASENAME_HINT` (`domain.ts:extractDocRefs`, `:107-137`) | `GitClient.readFileAt(headSha, path)`, falling back once to `fetchPullHead` then a retry, then `GitHubClient.getFileContent` (`service.ts:144-179`) | `MAX_DOCS` = 3, `DOC_MAX_CHARS` = 12 000/doc, `DOCS_TOTAL_MAX_CHARS` = 30 000 total |
| Commits | `pr_commits.message`, oldest first (`repository.ts:61-65`) | — | `MAX_COMMITS` = 30 × `COMMIT_SUBJECT_MAX_CHARS` = 200 chars |
| Changed paths | Diff paths passed by the executor, falling back to persisted `pr_files.path` (`service.ts:99`, `repository.ts:66-69`) | — | `MAX_FILE_PATHS` = 150 |
| Conventional prefix | Title, else first matching commit subject (`domain.ts:conventionalType`, `:243-249`) | — | — |
| External refs | Jira `ABC-123`, `linear.app/…`, cross-repo issue mentions, any other URL (`domain.ts:extractExternalRefs`, `:180-204`) | **never fetched** — recorded with `fetched:false` | `MAX_EXTERNAL_REFS` = 10 |

Every candidate doc path passes `safeRepoPath` (`domain.ts:224-240`) before it
can reach `git show <ref>:<path>`, the GitHub contents API, or the LLM prompt:
rejects any character outside an allowlist (`\w . - / ` and space —
`SAFE_PATH_CHARS_RE`, `domain.ts:214`, so `<`, `>`, `"`, and backticks can't
break out of a prompt fence), empty, absolute, or leading-`-` paths, `\`/NUL/`:`,
a `..` segment after `posix.normalize`, a `.git/` prefix, and any extension
outside `DOC_EXTENSIONS` (`.md .mdx .txt .rst .adoc`, `constants.ts:15`).

`isSubstantiveDescription` (`domain.ts:213-221`) strips HTML comments,
checkbox lines, template headings, and URLs, then requires
`SUBSTANTIVE_DESCRIPTION_MIN_CHARS` = 150 chars left — a PR template with only
unchecked boxes counts as "no description".

## Sequence

```mermaid
sequenceDiagram
  participant X as ReviewRunExecutor
  participant S as IntentService
  participant Repo as IntentRepository
  participant GH as GitHubClient
  participant G as GitClient
  participant M as LLM (review_intent)
  participant E as reviewer-core

  X->>X: runLog.step "Loading PR diff"
  X->>S: runLog.step "Deriving PR intent" -> ensure(ws, prId, {diffPaths})
  S->>Repo: loadInputs(ws, prId)
  opt pull.body == null
    S->>GH: getPullRequest -> Repo.updatePullBody
  end
  S->>S: extractIssueRefs / extractDocRefs / extractExternalRefs + inputsHash
  alt head_sha and inputs_hash match cached row
    S-->>X: cached record
  else
    S->>GH: getIssue (up to MAX_ISSUES, isolated try/catch)
    S->>G: readFileAt(headSha, path) (fallback fetchPullHead, then GH.getFileContent)
    S->>M: completeStructured(schemaName 'PrIntent', temp 0, 30s)
    S->>Repo: upsert (tokens, cost; cost_usd_total += cost)
  end
  Note over X,S: derivation error -> "intent: skipped", review proceeds without intent
  loop each queued agent
    X->>E: reviewPullRequest({..., prDescription, intent})
  end
```

Executor wiring: `ReviewRunExecutor.executeRuns` runs the diff load
(`run-executor.ts:126-136`), then the intent derivation as one more shared
pre-work step (`run-executor.ts:138-189`) before iterating `runOneAgent` for
each queued run (`:191-218`). The `IntentDeriver` port
(`run-executor.ts:50-56`) is declared locally so the executor module doesn't
import `modules/intent` — its `ensure()` result carries a pre-formatted
`sourcesSummary` string (built by `IntentService` from
`domain.ts:formatSourcesSummary`) so the executor never needs
`../intent/domain.js` for the `intent: sources — …` log line.
`Container['intentService']` satisfies the port structurally and is wired in
via `ReviewService` → `Container.intentService` (`platform/container.ts:125-133`).

## Cache key

The cached row is reused when **both** match the current request
(`service.ts:118-123`):

- `head_sha` — the PR's current head commit.
- `inputs_hash` — `sha256` of a stable JSON projection of `{title, body,
  branch, commits, paths, refs, provider, model}` plus
  `INTENT_PROMPT_VERSION` (`domain.ts:inputsHash`, `:293-318`; version pinned
  in `constants.ts:21`).

A cache hit costs nothing and does not call the LLM (`service.ts:118-123`
returns before any fetch). `POST /pulls/:id/intent {force:true}` bypasses the
check unconditionally (`service.ts:118`, `routes.ts:34-36`). Editing a linked
issue or plan without a new commit is invisible to the cache key — `stale`
(below) and manual `force` are the only ways to notice.

## Confidence

Rule-based cap, then the LLM's own `self_confidence` can only lower it, never
raise it (`domain.ts:evidenceCap`/`finalConfidence`, `:253-289`):

| Cap | Rule | Score (`CONFIDENCE_SCORE`, `constants.ts:26-30`) |
| --- | --- | --- |
| `high` | (issue fetched **or** doc fetched) **and** substantive description, **or** both an issue and a doc fetched | 0.85 |
| `medium` | exactly one of {issue fetched, doc fetched, substantive description} | 0.6 |
| `low` | none of the above (only indirect signals: branch, commits, file paths) | 0.3 |

Final value: `confidence = self_confidence` if its rank (`low`<`medium`<`high`)
is `<=` the cap's rank, else the cap (`finalConfidence`, `:282-289`).
`missing_docs = true` exactly when the final confidence is `low`
(`:287`). `change_type` comes from the LLM; the conventional-commit hint only
fills in when the LLM returned `other` (`service.ts:249-250`).

## `pr_intent` columns

One row per PR (`prId` is the primary key — regenerating overwrites it),
defined in `src/db/schema/reviews.ts:71-119`, table created in migration
`0019_brief_loa.sql`, CHECK constraints added in `0020_left_micromacro.sql`:

| Column | Type | Notes |
| --- | --- | --- |
| `pr_id` | uuid PK | FK → `pull_requests`, cascade |
| `workspace_id` | uuid | FK → `workspaces`, cascade; indexed (`pr_intent_ws_idx`) |
| `intent`, `in_scope`, `out_of_scope` | text / jsonb | the `Intent` shape |
| `head_sha`, `inputs_hash` | text | cache key |
| `change_type` | text, default `other` | `IntentChangeType`; `CHECK ... in (...)` (`pr_intent_change_type_check`) |
| `confidence` | text, default `low` | `IntentConfidence`; `CHECK ... in ('high','medium','low')` (`pr_intent_confidence_check`) |
| `confidence_score` | double precision, default 0 | 0.85 / 0.6 / 0.3; `CHECK between 0 and 1` (`pr_intent_confidence_score_check`) |
| `missing_docs` | boolean, default true | |
| `sources` | jsonb, default `[]` | `IntentSource[]`; `CHECK jsonb_typeof(...) = 'array'` (`pr_intent_sources_array_check`) |
| `provider`, `model` | text | resolved via `resolveFeatureModel(..., 'review_intent')` |
| `tokens_in`, `tokens_out` | int, default 0 | this call only; `CHECK >= 0` each (`pr_intent_tokens_in_check` / `_out_check`) |
| `cost_usd` | numeric, nullable | this call only; null when unpriced |
| `cost_usd_total` | numeric, nullable | running total across every (re)generation |
| `created_at`, `updated_at` | timestamptz | |

`IntentRepository` maps each Drizzle row to the domain shape `StoredIntent`
(`domain.ts:StoredIntent`, `repository.ts:toStoredIntent`, `:20-41`):
snake_case, `Number()` coercion for the two cost columns (Postgres `numeric`
round-trips as a string — see `server/INSIGHTS.md`), jsonb `sources` parsed
with `IntentSource.array().catch([])`, and ISO `updated_at` — no `db/schema`
type crosses the `IntentStorePort`. `toIntentRecord`
(`src/modules/intent/helpers.ts:12-15`) then drops the cache-only
`inputs_hash` and adds `stale = head_sha !== <PR's current head_sha>` —
computed against the live PR row, not the cached one, so a force-pushed PR
shows `stale:true` even before a regeneration.

## API

`src/modules/intent/routes.ts:12-50`:

| Route | Behavior |
| --- | --- |
| `GET /pulls/:id/intent` | `params: IdParams`, `200: PrIntentResponse` (`{intent: PrIntentRecord \| null}`); `null` before the first generation (`routes.ts:16-24`) |
| `POST /pulls/:id/intent` | `body: GenerateIntentBody` (`{force: boolean = false}`, `.strict()`), `200: PrIntentRecord`; rate-limited to `{max: 10, timeWindow: '1 minute'}` (`routes.ts:26-49`) |

The POST handler logs `req.log.info({prId, cached, confidence, model,
costUsd}, 'intent: generated')` (`routes.ts:37-46`) after every call,
cached or not.

## Live Log lines

Emitted through `runLog` into both the SSE stream and the persisted
`run_traces.trace.log` (`run-executor.ts:138-189`):

- `Deriving PR intent` — the `runLog.step` label wrapping the whole
  derivation (`:145-153`).
- `intent: cached for head <sha7> (derived <iso>)` (`:158`).
- `intent: derived with <provider>/<model> — <in>→<out> tokens · $<cost|unpriced> (billed once per PR, not per agent)` (`:160-163`).
- `intent: sources — <sourcesSummary>` (`:164`) — `IntentService.ensure`
  precomputes this with `domain.ts:formatSourcesSummary` (`:510-519`) and
  returns it on the result, so the executor never imports `modules/intent`
  for it, e.g. `title; description; issue #471 (fetched); docs/plan.md
  (fetched); ABC-123 (reference only — not fetched)`.
- `intent: confidence <band> (<score>) · change_type <type>[ · missing docs — inferred from indirect signals]` (`:166-169`).
- `intent: PR body unavailable (<msg>) — continuing without it` — only when
  the PR row has no body and the GitHub re-fetch also fails (`service.ts:92-95`).
- `intent: skipped — <msg>; reviewing without intent` — derivation threw
  (`run-executor.ts:187`).

Pino (server logs, not the run's Live Log): `review: intent ready` /
`review: intent skipped`, with `{prId, headSha, cached, confidence,
changeType, missingDocs, model, tokensIn, tokensOut, costUsd}`
(`run-executor.ts:170-188`). Issue/plan bodies and secrets never appear in
either log — only counts, refs, and the derived summary fields.

## Cost accounting

- Every (re)generation writes `cost_usd` (this call only) and folds it into
  `cost_usd_total = coalesce(old, 0) + coalesce(new, 0)` via a single
  `onConflictDoUpdate` (`repository.ts:upsert`, `:92-144` — the `::numeric`
  cast matters, see the inline comment at `:134-138` and `server/INSIGHTS.md`).
- `pr_intent.cost_usd_total` is **never** written to `agent_runs`: the PR
  list's COST column sums `doneRunCostsForPulls` (per-run `agent_runs.cost_usd`)
  **plus** `IntentRepository.costsForPulls(workspaceId, prIds)` — workspace-
  scoped like every other query on this repository — in one `sumRunCosts` fold
  (`modules/pulls/routes.ts:144-147`, `modules/pulls/cost.ts:12-21`,
  `modules/intent/repository.ts:166-176`) — the intent cost is billed once per
  PR regardless of how many agents run in that batch, and it is added exactly
  once per generation, not once per agent.
- Two concurrent review runs that both miss the cache each pay for one LLM
  call and both amounts land in `cost_usd_total` (no de-duplication) — an
  accepted double-count documented in the plan's risk list.

## Degrade behavior

A failure anywhere in `ensure` (missing key, LLM timeout, malformed
structured output) is caught once, by the executor, around the whole
derivation step (`run-executor.ts:144-189`):

- The run logs `intent: skipped — <msg>; reviewing without intent` and Pino
  logs `review: intent skipped`.
- `intent` stays `null` and `prBody` falls back to `pull.body ?? null`
  (`:142-143`); every agent in the batch runs exactly as it would without the
  Intent Layer — `runOneAgent` only adds the `intent` slot when non-null
  (`:319`).
- The queued runs are **not** failed: intent derivation is pre-work shared
  across agents, not a per-run dependency (contrast with the diff load, whose
  failure does call `failAll`, `:131-135`).
- A body-fetch failure inside `ensure` is narrower and non-fatal on its own:
  it only logs `intent: PR body unavailable (...)` and continues with
  `body = null` (`service.ts:91-95`), which likely caps confidence at `low`.

## Security notes

- **No external URL fetching.** Jira tickets, `linear.app` links, and any
  other bare URL are recorded with `fetched:false` and a `reference only — not
  fetched` note (`domain.ts:extractExternalRefs`, `:180-204`); the only I/O
  the service performs is `GitHubClient` (fixed Octokit host) and the local
  `GitClient` against the already-cloned repo (`service.ts:87-179`) — no SSRF
  surface.
- **Path guard.** `safeRepoPath` (`domain.ts:224-240`) plus a second check
  inside the git adapter (`isSafeRelativePath`,
  `adapters/git/simple-git.ts:150-158`) reject any character outside its
  allowlist (`\w . - / ` and space — so `<`, `>`, `"`, backticks can't break
  out of a prompt fence or the `source="…"` attribute), traversal (`..`),
  absolute paths, `.git/`, a leading `-` (argv-injection), and any extension
  outside the doc allowlist before a path ever reaches `git show <ref>:<path>`
  or `GitHubClient.getFileContent`. `readFileAt` additionally requires `ref` to
  match a hex SHA (`/^[0-9a-f]{7,40}$/i`, `simple-git.ts:133-136`) and passes
  argv to `simple-git`'s `raw()` without a shell.
- **Untrusted wrapping.** Everything the PR author or a linked issue/doc wrote
  (title, branch, description, issue **and linked-issue title** bodies, doc
  contents, commit subjects) is fenced with `wrapUntrusted` before it reaches
  the LLM (`domain.ts:renderIntentUserMessage`, `:443-505`) — an issue's title
  is as attacker-controlled as its body, so it sits inside the `issue-<n>`
  fence alongside the body, never as a bare trusted line; changed paths and
  external refs are fenced too (`pr-paths` / `external-refs`), and fence
  labels are static (`issue-<n>`, `doc-<index>`), never interpolated from
  user-controlled text. The system prompt tells the model those blocks are
  data, not instructions (`prompt.ts:SYSTEM_PROMPT`, `:26`). The same
  discipline applies on the way **out**: `renderIntentSection`
  (`reviewer-core/src/prompt.ts:91-110`) wraps the rendered intent in
  `wrapUntrusted('pr-intent', …)`, capped to `MAX_INTENT_CHARS` = 2000 chars,
  with the trusted "never lowers severity" instruction line rendered
  **outside** the wrapper (`reviewer-core/src/prompt.ts:46-50`) — the
  reviewer-core `INJECTION_GUARD` already names "derived intent/scope" among
  the untrusted content it defends against (`reviewer-core/src/prompt.ts:18`).
