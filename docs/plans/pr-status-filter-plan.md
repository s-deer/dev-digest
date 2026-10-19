# Development Plan: Review-status filter for GET /repos/:id/pulls
**Status:** approved  **Goal:** Add an optional comma-separated `status` query parameter to `GET /repos/:id/pulls`. It narrows the list to PRs whose derived review status is in the requested set, and rejects unknown values with a 422 that names them.  **Source spec:** server/specs/2026-10-18-pull-list-status-filter.md  **Execution mode:** single-agent

## 1. Context & sources consulted
- Read: the approved spec (all AC/NFR/EC); `CLAUDE.md`; `server/CLAUDE.md`; `TESTING.md`; `server/src/modules/pulls/routes.ts`, `status.ts`; `server/src/app.ts` (error handler, ~lines 122-175); `server/src/platform/errors.ts`; `server/src/modules/conventions/routes.ts` (precedent `?status=` filter); `server/src/modules/_shared/schemas.ts`; `server/src/vendor/shared/contracts/platform.ts` (`PrStatus`, `PrMeta`); `server/src/adapters/mocks.ts` (`MockGitHubClient`); `server/test/integration.it.test.ts`, `reviews.it.test.ts`, `pulls-status.test.ts`.
- Applied lessons: `server/INSIGHTS.md` 2026-09-15 "server and client copies of `@devdigest/shared` have already drifted": change only `server/src/vendor/shared`, do not sync the client copy.
- History: `git log --all -- '*pull*status*'` shows only the squashed snapshot commit, so there is no earlier design to reuse.
- Existing coverage: `integration.it.test.ts:115` and `reviews.it.test.ts` (lines ~411, ~551) already call `GET /repos/:id/pulls` through `buildApp({ overrides: { github: new MockGitHubClient(...) } })`. None exercises a status filter. `MockGitHubClient` does not count `listPullRequests` or `getPullRequest` calls, so the new test needs a counting subclass or `vi.spyOn`.

## 2. Scope
- In scope: shared contract for the query and allowed values; pure parse/validate helper; route wiring and in-memory filter; hermetic and DB-backed tests; `server/README.md` API-map line.
- Out of scope: client vendored copy of `@devdigest/shared`; any client UI; DB schema or migrations; sorting, pagination, counts; changing `deriveReviewStatus` or the stale threshold; restructuring the pulls route into service/repository layers; changing the global error handler in `src/app.ts`.
- Assumptions: filtering is applied in memory after status derivation, so no SQL change is needed. Repeated `?status=` arrives from Fastify's default querystring parser as `string[]`, and the schema accepts `string | string[]`.

## 3. Architecture & constraints
- Backend: `pulls` module. Ring 1 is a pure helper in `status.ts` (`parseStatusFilter`). Ring 4 is `routes.ts`, which does the minimum: the querystring schema, one parse call placed first in the handler, and a filter on the mapped array. The inline route body is a known deviation; do not deepen it and do not refactor it (proportionate change).
- Error-shape decision: `parseStatusFilter` is a pure function that throws the existing `ValidationError('...', { invalid, allowed })`. The global handler already sends `AppError` as `{ error: { code, message, details } }` with the error's own status (`ValidationError` is 422 `validation_error`, `errors.ts:25`). So `src/app.ts` stays untouched.
  - Why not a Zod refinement mapped by the handler: the zod-provider path hits the first branch of the global handler, which hardcodes `message: 'Request validation failed'` and `details: err.validation`. Producing our shape would mean branching the global handler on one endpoint, which couples the shared handler to the pulls module.
  - Why this is still the schema-first convention: the route schema still validates the raw `status` shape (string or string[]) through `fastify-type-provider-zod`. The helper does domain validation of values on already-typed input; it never calls `Schema.parse(req.query)`.
  - A custom Zod error class would add a new error type for one endpoint.
- Ordering (AC-18, NFR-1): the first statement of the handler is `parseStatusFilter(req.query.status)`. It runs before `getContext`, the repo lookup, `container.github()`, the sync/upsert and the diff-stat backfill, so an invalid filter does no I/O and no writes, even for an unknown repo.
- Filtering (AC-10, AC-15, AC-16, AC-19, NFR-3): the filter runs on the final mapped `PrMeta[]` using each entry's already-derived `status` (one `now` per request). It is an order-preserving `Array.filter`, so the sync, backfill, reads and entry shape are identical to an unfiltered request.
- Contracts: `@devdigest/shared` (server vendored copy) first. Add `PR_LIST_STATUSES` (const tuple of the five derived statuses, excluding `open`), `PrListStatus` (z.enum), and `PrListQuery = z.object({ status: z.union([z.string(), z.array(z.string())]).optional() })`. Export from `contracts/platform.ts` (already re-exported by `index.ts`).
- DB / migrations: none.
- Commands per package (server, pnpm): `pnpm typecheck`; `pnpm exec vitest run --exclude '**/*.it.test.ts'` (hermetic); `pnpm exec vitest run .it.test` (needs Docker). No lint command is defined in `server/CLAUDE.md` or the commands table; report lint as not found.

## 4. Steps
### S1 — Shared contract for the status query  [package: server] [depends on: —]
- AC: AC-20, AC-13 (allowed set excludes `open`), NFR-5
- Files: modify `server/src/vendor/shared/contracts/platform.ts` · modify `server/test/contracts.test.ts`
- Change: after `PrStatus`, add `export const PR_LIST_STATUSES = ['needs_review','reviewed','stale','merged','closed'] as const`, `export const PrListStatus = z.enum(PR_LIST_STATUSES)` (type `PrListStatus`), and `export const PrListQuery = z.object({ status: z.union([z.string(), z.array(z.string())]).optional() })` (type `PrListQuery`). The query stays loose on purpose, so value validation and the named-value 422 happen in S2. Do not change `PrStatus` or `PrMeta`. Do not touch `client/src/vendor/shared`.
- Skills & rules: `onion-architecture` "Contract: request/response Zod schemas in the shared contracts first"; `zod` "type-export-schemas-and-types: export both the schema and the inferred type", "schema-use-enums for fixed string values"; `typescript-expert` "const assertions for literal types".
- Tests: update `server/test/contracts.test.ts` (hermetic): `PR_LIST_STATUSES` equals the five statuses, excludes `open`, is a subset of `PrStatus.options`, and `PrListQuery` accepts undefined, a string and a string[].
- Acceptance: the contract exports the three symbols; the allowed set is exactly the five derived statuses.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/contracts.test.ts`

### S2 — Pure status-filter parser  [package: server] [depends on: S1]
- AC: AC-2, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-11, AC-12, AC-13, NFR-1, NFR-6, EC-2 to EC-11, EC-16
- Files: modify `server/src/modules/pulls/status.ts` · create `server/test/pulls-status-filter.test.ts`
- Change: add `parseStatusFilter(raw: string | string[] | undefined): Set<PrListStatus> | null`.
  - Normalise the input to `string[]`, split each on `,`, trim, and drop empty segments.
  - If no values remain, return `null` (unfiltered, AC-2).
  - Match case-sensitively against `PR_LIST_STATUSES` (AC-8).
  - Collect invalid values deduped in order of first appearance. If any are invalid, throw ``new ValidationError(`Invalid status value(s): ${invalid.map(v => JSON.stringify(v)).join(', ')}`, { invalid, allowed: [...PR_LIST_STATUSES] })`` (AC-11, AC-12).
  - Otherwise return the deduped `Set` (AC-6, AC-7).
  - Import `ValidationError` from `../../platform/errors.js` and the types from `@devdigest/shared`; no fastify, drizzle or container imports.
  - Echo invalid values only as JSON string data, never into any query or external call (NFR-1).
- Skills & rules: `onion-architecture` "pure functions live in helpers/domain (ring 1), no I/O", "inner rings throw the project's error taxonomy, the shared handler owns the HTTP envelope", "inner rings never call Schema.parse(req.body)"; `typescript-expert` "no implicit any, explicit return types for exported functions".
- Tests: create `server/test/pulls-status-filter.test.ts` (hermetic; table-driven): undefined, `''`, whitespace, `','`, `['', 'stale']` give null or the expected Set; `' needs_review , stale '`, `'stale,,merged'`, `',stale,'`, `'stale,stale'`, repeated `['needs_review','merged']`, all five (Set size 5); throws for `Stale`, `NEEDS_REVIEW`, `open`, `'stale,bogus'`, `'foo,bar,foo'` (details.invalid is `['foo','bar']`, details.allowed is the five, message names each value, error is `ValidationError` with statusCode 422 and code `validation_error`), a hostile value `<script>\u0000`.
- Acceptance: every parsing and validation row above passes with the expected set or `{ invalid, allowed }`.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/pulls-status-filter.test.ts test/pulls-status.test.ts`

### S3 — Wire the filter into GET /repos/:id/pulls  [package: server] [depends on: S2]
- AC: AC-1, AC-3, AC-9, AC-10, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, NFR-2, NFR-3, NFR-4, NFR-5
- Files: modify `server/src/modules/pulls/routes.ts`
- Change:
  - Change the route schema to `{ params: IdParams, querystring: PrListQuery }` (import `PrListQuery` from `@devdigest/shared`, `parseStatusFilter` from `./status.js`).
  - As the very first statement of the handler, run `const wanted = parseStatusFilter(req.query.status);` so an invalid filter throws 422 before `getContext`, the repo select, `container.github()`, upsert and backfill.
  - Change `return rows.map(...)` to build `const list = rows.map(...)` unchanged, then `return wanted ? list.filter((p) => wanted.has(p.status as PrListStatus)) : list;`.
  - Update the route's doc comment to mention the optional `status` filter.
  - Make no other edits: do not extract the body, change the sync or backfill, or change the response shape or order.
- Skills & rules: `fastify-best-practices` "schema-first: validate querystring with a Zod schema on the route"; `onion-architecture` "parse at the boundary", "route handler: schema, context, call; no new business logic (the derivation stays in status.ts)", "known deviation (inline logic in routes.ts): don't deepen it, don't mass-refactor"; project rule "never hand-roll Schema.parse(req.body)".
- Tests: covered by S4.
- Acceptance: the unfiltered path is byte-identical in behaviour; the typecheck is clean; with a filter the entries are the order-preserving subsequence whose `status` is in the set.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`

### S4 — Route integration test and API-map doc  [package: server] [depends on: S3]
- AC: AC-1, AC-3, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, NFR-1, NFR-2, NFR-3, EC-1, EC-12 to EC-15
- Files: create `server/test/pulls-status-filter.it.test.ts` · modify `server/README.md`
- Change:
  - New DB-backed file following the `pulls-comments.it.test.ts` skeleton (`startPg`/`dockerAvailable`/`describe.skip`, `buildApp({ config, db, overrides: { github } })`, `seed`).
  - Seed one repo and PRs via `db.insert(t.pullRequests)` covering all five derived statuses, using `status` ('open'/'merged'/'closed'), `headSha`, `lastReviewedSha` and `updatedAt` (older than `STALE_DAYS` for stale). Use a `MockGitHubClient` whose `pulls` option returns `[]`, so the sync does not alter the seeded rows.
  - Create a counting subclass of `MockGitHubClient` that records `listPullRequests` and `getPullRequest` calls.
  - Cases:
    - (a) No filter returns all PRs, and the same state with `?status=` (empty) returns the identical array (AC-1, AC-2).
    - (b) `?status=needs_review,stale`: every returned `status` is in the set, and the result equals the unfiltered response filtered in JS (same fields, same relative order) (AC-3, AC-10, AC-15, AC-16).
    - (c) All five statuses equals the unfiltered response (AC-9). A repeated param `?status=stale&status=merged` is the union.
    - (d) A valid filter that matches nothing returns `200 []` (AC-14).
    - (e) An unknown repo uuid with a valid filter returns 404 `not_found` (AC-17). Another workspace's repo also returns 404.
    - (f) `?status=stale,bogus,bogus` returns 422, `error.code === 'validation_error'`, a message containing `bogus`, and `details` deep-equal `{ invalid: ['bogus'], allowed: [five] }`. Also `Stale` and `open` return 422.
    - (g) AC-18: the same invalid filter against both a real repo and an unknown repo uuid returns 422, the counting client saw zero `listPullRequests` and `getPullRequest` calls, and the `pull_requests` row count and rows are unchanged.
    - (h) AC-19: a valid filter makes the same github call counts as an unfiltered request on the same state.
    - (i) EC-14: updating a PR's `lastReviewedSha` or `updatedAt` moves it between filtered results.
  - Add the `?status=` filter to the pulls node of the module-map diagram in `server/README.md` (e.g. `/repos/:id/pulls?status= · /pulls/:id · /pulls/:id/comments`). That README documents no per-route query params elsewhere, so keep it to this one-line diagram edit.
- Skills & rules: `onion-architecture` "route behaviour is tested via app.inject with container overrides and the real DB in `*.it.test.ts`"; `fastify-best-practices` "test with inject()"; project TESTING.md "mock the outside world via `src/adapters/mocks.ts`; one happy path plus the edge that matters; `*.it.test.ts` self-skips without Docker"; project rule "no DB access in non-`.it` tests".
- Tests: `server/test/pulls-status-filter.it.test.ts` (integration).
- Acceptance: all cases pass with Docker; the file self-skips without it.
- Verify: `cd server && pnpm exec vitest run pulls-status-filter.it.test` (needs Docker; report SKIPPED if unavailable), then `pnpm typecheck`.

### AC coverage
| AC / NFR / EC | Step(s) |
|---|---|
| AC-1 | S3, S4 |
| AC-2 | S2, S4 |
| AC-3 | S3, S4 |
| AC-4, AC-5, AC-6 | S2 |
| AC-7 | S2, S4 |
| AC-8 | S2 |
| AC-9 | S2, S3, S4 |
| AC-10 | S3, S4 |
| AC-11, AC-12 | S2, S4 |
| AC-13 | S1, S2, S4 |
| AC-14 | S3, S4 |
| AC-15, AC-16 | S3, S4 |
| AC-17 | S3, S4 |
| AC-18 | S2, S3, S4 |
| AC-19 | S3, S4 |
| AC-20 | S1 |
| NFR-1 | S2, S3, S4 |
| NFR-2 | S3, S4 |
| NFR-3 | S3, S4 |
| NFR-4 | S3 |
| NFR-5 | S1, S3 |
| NFR-6 | S2 |
| EC-1 to EC-17 | S2 (EC-2 to EC-11, EC-16), S3/S4 (EC-1, EC-12 to EC-15) |
| EC-17 (malformed repo id, unchanged) | S3 (no change; the `IdParams` schema remains) |

## 5. File inventory
server (pnpm):
- modify `server/src/vendor/shared/contracts/platform.ts`
- modify `server/src/modules/pulls/status.ts`
- modify `server/src/modules/pulls/routes.ts`
- modify `server/test/contracts.test.ts`
- create `server/test/pulls-status-filter.test.ts`
- create `server/test/pulls-status-filter.it.test.ts`
- modify `server/README.md`

Do not touch: `server/src/app.ts`, `client/**`, `server/src/db/**` and migrations, `pnpm-lock.yaml`, `server/clones/**`.

## 6. Verification (end-to-end)
- `cd server && pnpm typecheck`
- `pnpm exec vitest run --exclude '**/*.it.test.ts'` (hermetic)
- `pnpm exec vitest run .it.test` (needs Docker; SKIPPED, not PASS, if absent)
- Optional manual check after `./scripts/dev.sh`: `curl 'http://localhost:3001/repos/<id>/pulls?status=stale,merged'` returns only those statuses; `?status=bogus` returns 422 with `details.invalid = ["bogus"]`.
- No browser e2e: no client or journey change.
- Lint: no command defined, so report "not found".

## 7. Risks & open questions
- → user: none.
- → spec-creator: none. The spec's `details` shape `{ invalid, allowed }` was proposed by the spec; the user accepted the 422 decision with it.
- → researcher: confirm that the installed `fastify` and `fastify-type-provider-zod` versions deliver a repeated `?status=a&status=b` to the querystring schema as `string[]` (assumed). S4 case (c) proves it. If it arrives differently, adjust `PrListQuery` in S1, not the helper.
- Risk: integration tests need Docker. Without it the S4 file self-skips and the AC-1, AC-14 to AC-19 route behaviour stays unproven.
- Candidate insight (do not write yet): the global error handler hardcodes the `Request validation failed` message and the raw zod issues for schema errors, so an endpoint needing a bespoke 422 body must throw `ValidationError` from a helper instead of using a Zod refinement.

## 8. Notes for reviewers
- Architecture: check that `parseStatusFilter` lives in ring 1 with no fastify/drizzle imports; that the parse is the first handler statement (before `getContext`, repo select and GitHub); that `app.ts` is unchanged; that no other part of the inline route was restructured.
- Security: untrusted `status` input is only matched against a fixed allow-list and echoed as JSON string data in the 422 body. It is never used in SQL, passed to GitHub, or logged unsanitised. No secrets, shell/git or HTML rendering are touched. Tenancy: workspace scoping is untouched. The filter only narrows the already workspace-scoped result.

## Not found
- A lint command for `server/` (none in `server/CLAUDE.md`, the root commands table or the checked manifests).
