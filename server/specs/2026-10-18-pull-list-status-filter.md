# Review-status filter for the pull request list

- **Status:** approved
- **Date:** 2026-10-18
- **Scope:** server (`pulls` module, `GET /repos/:id/pulls`) + the `@devdigest/shared` contract vendored at `server/src/vendor/shared`
- **Related:** `server/docs/findings-read-model.md` (the PR list read model), `server/docs/run-lifecycle-and-cost.md` (PR list cost column), server INSIGHTS "The server and client copies of `@devdigest/shared` have already drifted apart" (2026-09-15), precedent filter `GET /repos/:id/conventions?status=…`

## Summary

`GET /repos/:id/pulls` always returns every PR of a repository. A client that cares only about some PRs, for example those that need review or have gone stale, has to download the whole list and filter it locally. This feature adds an optional `status` query parameter. It narrows the list to PRs whose derived review status is one of the requested values. A request without the filter behaves exactly as it does today.

## Goals / Non-goals

**Goals:**
- Let a caller request only the PRs whose review status is in a given set, using one comma-separated `status` query parameter.
- Match on the same review status the response already shows for each PR (`needs_review`, `reviewed`, `stale`, `merged`, `closed`), computed when the list is read.
- Reject unknown status values with a clear `422` that names each bad value.
- Keep the unfiltered behaviour unchanged for the existing callers: the web client's PR list hook and the MCP server's PR-number lookup.

**Non-goals:**
- Any client UI (filter chips, URL state in the studio). The client's vendored copy of the shared contract is not changed by this feature.
- Database schema changes. The review status stays computed on read, not stored.
- Counts per status, sorting, pagination, or a defined list order. Today's order is not explicitly defined, and this feature does not define it.
- Changing how the review status is derived (the stale threshold, the `needs_review` rule) or what the response contains.
- Filtering by GitHub merge state or by any field other than the derived review status.

## User stories

- **US-1** As an API client (the studio, the MCP server, a script), I want to ask for only the PRs in one or more review statuses, so that I get what I care about without downloading and filtering the whole list.
- **US-2** As an existing caller that sends no filter, I want the endpoint to behave exactly as before, so that nothing I already rely on breaks.
- **US-3** As a client developer, I want a precise error that names the bad value when I send an unknown status, so that I can fix my request without guessing.

## Workflow

```mermaid
sequenceDiagram
  participant C as Client
  participant API as API (pulls)
  participant GH as GitHub
  participant DB as Persisted PRs / reviews

  C->>API: GET /repos/:id/pulls?status=needs_review,stale
  alt status contains an unknown value
    API-->>C: 422 { error: { code: "validation_error", message names the bad value(s), details } }
    Note over API,GH: no repo lookup side effects, no GitHub sync
  else repo not in caller's workspace
    API-->>C: 404 not_found (as today)
  else valid or absent filter
    API->>GH: sync + diff-stat backfill (same as an unfiltered request; skipped offline)
    API->>DB: read PRs, latest reviews, costs
    API->>API: derive review status per PR (one "now" per request)
    API->>API: keep only PRs whose derived status is in the requested set (all PRs if no filter)
    API-->>C: 200 PrMeta[] (same entry shape, same relative order)
  end
```

## Acceptance criteria

Parsing of the `status` parameter

- **AC-1** (US-2): When `GET /repos/:id/pulls` is requested without a `status` query parameter, the API shall return the same status code, entries, entry fields, and order as it did before this feature.
- **AC-2** (US-2): When the `status` parameter is present but contains no non-empty values after trimming (for example `?status=`, `?status=%20`, `?status=,`), the API shall treat the request as unfiltered.
- **AC-3** (US-1): When `status` holds one or more comma-separated known values, the API shall return only the PRs whose derived review status equals one of those values.
- **AC-4** (US-1): The API shall trim leading and trailing whitespace from each comma-separated value before matching it, so `?status= needs_review , stale ` behaves like `?status=needs_review,stale`.
- **AC-5** (US-1): The API shall ignore empty segments between commas, so `?status=stale,,merged` and `?status=,stale,` behave like `?status=stale,merged` and `?status=stale`.
- **AC-6** (US-1): When the same value appears more than once (for example `?status=stale,stale`), the API shall return the same result as if it appeared once, with no duplicated entries.
- **AC-7** (US-1): When the `status` parameter is repeated (for example `?status=needs_review&status=merged`), the API shall treat the union of the values from every occurrence as the requested set, parsing each occurrence by the same rules as a single parameter.
- **AC-8** (US-3): The API shall match status values case-sensitively, and if a value differs from a known status only by case (for example `Stale`, `NEEDS_REVIEW`), then the API shall reject it as unknown under AC-11.
- **AC-9** (US-1): When the requested set contains all five filterable statuses, the API shall return the same entries as an unfiltered request.

Matching and response

- **AC-10** (US-1): The API shall filter on the review status it returns in each entry's `status` field for the same request, so every returned entry's `status` is one of the requested values.
- **AC-11** (US-3): If any value in the `status` parameter is not one of `needs_review`, `reviewed`, `stale`, `merged`, `closed`, then the API shall respond `422` with the standard error envelope, error code `validation_error`, and a message that names every invalid value.
- **AC-12** (US-3): If the request is rejected under AC-11, then the error `details` shall list the invalid values (each once, in order of first appearance) and the allowed values.
- **AC-13** (US-3): If the `status` parameter contains `open`, then the API shall reject it as unknown under AC-11, because the list never derives `open` even though the shared status enum contains it.
- **AC-14** (US-1): When a valid filter matches no PR of the repository, the API shall respond `200` with an empty array.
- **AC-15** (US-1): When a filter is applied, each returned entry shall have exactly the shape and field values it would have in an unfiltered response made in the same state (score, cost, findings, and so on).
- **AC-16** (US-1): When a filter is applied, the returned entries shall keep the relative order they would have in an unfiltered response made in the same state.

Interaction with the rest of the endpoint

- **AC-17** (US-1): If the repository does not exist or belongs to another workspace and the `status` parameter is valid or absent, then the API shall respond `404 not_found` as it does today.
- **AC-18** (US-3): If the `status` parameter is invalid, then the API shall respond `422` under AC-11 even when the repository does not exist, and shall not sync from GitHub, backfill diff stats, or change any persisted data for that request.
- **AC-19** (US-1): When a valid filter is applied, the API shall sync and persist PR data from GitHub (or skip syncing offline) exactly as an unfiltered request would, so the filter only narrows the response.
- **AC-20** (US-2): The shared contract package shall define the `status` query contract and its set of allowed values, so that the server and future clients use the same definition.

## Non-functional requirements

- **NFR-1 Security (untrusted input):** Values in the `status` parameter are untrusted. An invalid value appears only as JSON string data in the error body. No value, valid or not, is passed to GitHub, written to storage, or put into query text other than as a matched known value. A rejected request causes no external calls and no writes (AC-18).
- **NFR-2 Tenancy:** The filter never widens the result beyond the caller's workspace and the requested repository. Workspace scoping stays as it is today (AC-17).
- **NFR-3 Performance:** A filtered request makes no more GitHub API calls and no more data-store reads per PR than an unfiltered request in the same state. Filtering adds no external round trips.
- **NFR-4 Cost:** The feature makes no LLM calls and adds none to the endpoint.
- **NFR-5 Compatibility:** The response schema (`PrMeta[]`) and the error envelope (`{ error: { code, message, details } }`) stay unchanged. Existing callers that send no `status` (the studio's PR list hook, the MCP PR-number lookup) see no difference (AC-1).
- **NFR-6 Language:** Error messages are in English, consistent with the rest of the API.

## Edge cases & errors

- **EC-1** No `status` parameter → unchanged behaviour (AC-1).
- **EC-2** `?status=`, whitespace only, or commas only → no filter (AC-2).
- **EC-3** Whitespace around values (`%20`, or `+` decoded as a space) → trimmed (AC-4).
- **EC-4** Empty segments (`stale,,merged`, leading or trailing comma) → ignored (AC-5).
- **EC-5** Duplicate values → deduplicated, no duplicate entries (AC-6).
- **EC-6** Repeated `status` parameters → union (AC-7). An empty occurrence next to a non-empty one (`?status=&status=stale`) → `stale` only (AC-2, AC-7).
- **EC-7** Wrong case (`Stale`) → `422` naming `Stale` (AC-8, AC-11).
- **EC-8** Mix of valid and invalid values (`stale,bogus`) → whole request rejected with `422` naming `bogus`. No partial result (AC-11, AC-12).
- **EC-9** Several invalid values (`foo,bar,foo`) → `422` naming `foo` and `bar`, each once (AC-11, AC-12).
- **EC-10** `open` requested → `422` (AC-13).
- **EC-11** All five statuses requested → same entries as unfiltered (AC-9).
- **EC-12** Valid filter with no matches → `200 []` (AC-14).
- **EC-13** Unknown repo or another workspace's repo with a valid filter → `404` (AC-17). With an invalid filter → `422` and no side effects (AC-18).
- **EC-14** A PR's status changes between two requests (time passes the stale threshold, a new commit is pushed, a review lands) → each request filters on the status derived in that request, so the PR moves between filtered results naturally (AC-10).
- **EC-15** GitHub unreachable or no token → the filter applies to the persisted PRs that are served offline (AC-19).
- **EC-16** Very long or hostile `status` value (markup, control characters, very long strings) → `422` with the value echoed only as JSON string data. Request-size limits stay as they are today (NFR-1).
- **EC-17** Malformed repo id (not a uuid) → behaves as today. This feature does not change it (out of scope).

## Contracts

**Request:** `GET /repos/:id/pulls[?status=<list>]`

- `status` (optional, may be repeated): a comma-separated list of review statuses. Allowed values: `needs_review`, `reviewed`, `stale`, `merged`, `closed`. Matching is case-sensitive. Each value is trimmed, empty segments are ignored, and duplicates and repeated parameters are unioned.
- An absent or effectively empty `status` means no filter.
- The allowed set is the set of review statuses the list derives. It is a subset of the shared `PrStatus` enum and deliberately excludes `open`, which the list never returns.

**Success response:** `200` with `PrMeta[]`, unchanged in shape. The array is the subsequence of the unfiltered response whose `status` is in the requested set, in the same relative order.

**Review-status semantics (unchanged, owned by the pulls module, computed on read):**
- `merged` / `closed`: GitHub's merge state for PRs that are no longer open.
- `needs_review`: an open PR that was never reviewed, or whose head moved since the last review.
- `stale`: an open PR whose current head was reviewed but that has not been updated within the existing stale threshold.
- `reviewed`: an open PR whose current head was reviewed recently.

**Error responses** (standard envelope `{ error: { code, message, details? } }`):
- `422`, `code: "validation_error"`: one or more unknown `status` values. `message` names every invalid value. `details` carries the invalid values and the allowed values. *Proposed by this spec, not a user decision:* `details` shape `{ invalid: string[], allowed: string[] }`.
- `404`, `code: "not_found"`: the repo is not found in the caller's workspace (unchanged).

**Decision note:** The user first asked for `400`, then chose `422` (2026-10-18) to match the API-wide convention: the global handler answers request-validation failures with `422 validation_error` (documented in `server/CLAUDE.md`), as does the precedent `GET /repos/:id/conventions?status=…` filter. Unlike the generic response, which carries raw schema issues and a fixed message, this endpoint's `422` must name every bad value in `message` and carry the `{ invalid, allowed }` shape in `details`.

**Ownership:**
- The `status` query contract and its allowed values are defined in `@devdigest/shared`, first in the server's vendored copy (AC-20). The client copy is out of scope. When a client feature later adopts the contract, port only the targeted diff into `client/src/vendor/shared` (INSIGHTS 2026-09-15).
- The pulls module owns how the review status is derived and how the list is filtered. Nothing is persisted for the filter.

## Open questions

None. The user's decisions cover scope, parameter format, the error status (422, chosen over the initial 400 to match the convention), empty-value handling, the matching basis, and the response shape. The remaining edge cases were settled conservatively as AC-2 and AC-4 to AC-18. The only invented detail is the `details` field names in the 422 body, which are marked as a proposal under Contracts.

## Traceability

| User story | AC | Edge case / NFR | Verification hint |
|---|---|---|---|
| US-1 | AC-3, AC-4, AC-5, AC-6, AC-7, AC-9, AC-10, AC-14, AC-15, AC-16, AC-19 | EC-3, EC-4, EC-5, EC-6, EC-11, EC-12, EC-14, EC-15, NFR-3, NFR-4 | hermetic unit (parsing, matching); integration (filtered list vs unfiltered list) |
| US-1 | AC-17 | EC-13, NFR-2 | integration |
| US-2 | AC-1, AC-2, AC-20 | EC-1, EC-2, NFR-5 | integration (unfiltered regression); typecheck/contract test |
| US-3 | AC-8, AC-11, AC-12, AC-13, AC-18 | EC-7, EC-8, EC-9, EC-10, EC-13, EC-16, NFR-1, NFR-6 | hermetic unit (parsing errors); integration (status code, envelope, no side effects) |

## Verification hints

- **AC-2 to AC-9, AC-11 to AC-13 (parsing and validation):** Hermetic unit tests on the parsing and validation behaviour. Use a table of inputs: empty, whitespace, commas only, duplicates, mixed case, `open`, mixed valid and invalid, several invalid, all five values. Check the resulting set or the reported invalid and allowed values.
- **AC-1, AC-15, AC-16 (unchanged behaviour and shape):** A DB-backed integration test (`*.it.test.ts`) with seeded PRs covering all five derived statuses and with GitHub mocked. Compare a filtered response against the unfiltered response from the same state: same entries, same fields, same relative order.
- **AC-10, EC-14:** In the integration test, make `updatedAt` and the last-reviewed sha produce each status. Check that every returned `status` is in the requested set, and that moving the clock or the head sha moves a PR between filtered results.
- **AC-14, AC-17:** An integration test with a filter that matches nothing gives `200 []`. Requests for an unknown repo and for another workspace's repo with a valid filter give `404 not_found`.
- **AC-18, AC-19, NFR-1, NFR-3:** In the integration test, mock the GitHub client and count its calls. An invalid filter makes zero list or detail calls and changes no rows, even for an unknown repo. A valid filter makes the same calls as an unfiltered request.
- **AC-11, AC-12:** Check the status code `422`, `error.code === "validation_error"`, that the message contains each invalid value, and the `details` contents. Check that `details` is the `{ invalid, allowed }` shape, not raw schema issues.
- **AC-20:** A typecheck plus a contract-level unit test showing that the allowed-values set in the shared contract equals the five filterable statuses and excludes `open`.
