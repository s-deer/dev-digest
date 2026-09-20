# Errors: inner rings raise domain errors, the edge maps them

`server/src/platform/errors.ts` is the error taxonomy every ring may import:

| Class | code | HTTP | Raise when |
|---|---|---|---|
| `NotFoundError` | `not_found` | 404 | entity missing **in this workspace** (don't reveal cross-tenant existence) |
| `ValidationError` | `validation_error` | 422 | a business rule rejects otherwise well-formed input |
| `ConfigError` | `config_error` | 500 | missing key/config discovered at call time |
| `ExternalServiceError` | `external_service_error` | 502 | an adapter's upstream failed |
| `AppError(code, msg, status, details?)` | custom | custom | anything else, e.g. `AppError('repo_exists', …, 409)` |

The shared handler in `app.ts` (`app.setErrorHandler`, registered before modules) turns these
into `{ error: { code, message, details } }` and handles Zod request/response validation
errors (422 / 500).

## Rules

- **Services and domain code throw; routes don't catch.** A route that catches in order to call
  `reply.status(404)` duplicates the handler and drifts from the envelope.
- **Adapters translate foreign errors.** Octokit `RequestError`, OpenAI `APIError`, Postgres
  `23505`: convert these into the taxonomy at the adapter/repository boundary, keeping the
  original as `details` or `cause` when it helps debugging. Inner rings must not branch on
  vendor error classes.
- **Prefer a specific `code` over a new class.** Add a subclass only if several places raise it
  and the client branches on it.
- **Background jobs** (`JobRunner` handlers) have no HTTP edge. Let the error propagate to the
  runner (which records and retries). For run executors, persist the failure through the run
  repository, as `reviews/run-executor.ts` does.
