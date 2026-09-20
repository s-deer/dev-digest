# Testing by ring

The architecture pays off in tests: the further in the code sits, the cheaper its test. Follow
`TESTING.md` ("typological, not exhaustive") and the filename split: `*.it.test.ts` =
DB-backed (testcontainers Postgres); every other `*.test.ts` must stay hermetic.

| Ring | What to test | How | File |
|---|---|---|---|
| 1 Domain / pure helpers | rules, derivations, mappers | plain Vitest, no mocks needed | `test/<module>-<topic>.test.ts` (e.g. `pulls-status.test.ts`, `findings-summary.test.ts`) |
| 3 Service / use case | orchestration, error cases, what gets enqueued | construct with fake repos + mocks from `src/adapters/mocks.ts` | hermetic `*.test.ts` |
| 4 Repository | SQL, tenancy scoping, constraints, mapping | real Postgres | `*.it.test.ts` using `test/helpers/pg.ts` |
| 4 Routes | status codes, validation envelope, wiring | `buildApp({ config, overrides })` + `app.inject` | hermetic if no DB (`routes-smoke.test.ts`), otherwise `*.it.test.ts` |
| 4 Adapters | request/response mapping | stub the SDK/transport | `adapters.test.ts` |

## Guidance

- **A service test that needs Docker is a layering smell.** If you can't test the use case
  without Postgres, the service is probably querying directly or relying on a row-shaped
  behaviour. Push the query into a repository and fake the repository.
- **Fakes over deep mocks.** A small in-memory class implementing the repository's methods
  reads better than `vi.fn()` chains mimicking Drizzle builders. Never mock Drizzle itself.
- **Narrow constructor deps make fakes trivial.** This is the practical reason new services
  take `{ repos, jobs, … }` rather than `Container`.
- **One integration test per data-backed workflow**, not per method. That's where SQL,
  migrations, and wiring bugs live.
- Don't add DB access to a non-`.it.` test file, and don't add a test only to raise coverage.
