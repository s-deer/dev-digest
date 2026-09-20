---
name: onion-architecture
description: Enforces Onion Architecture (dependency rule, ports & adapters, composition root) in the DevDigest backend — `server/src/modules/**`, `server/src/adapters/**`, `server/src/platform/container.ts`. Use this skill whenever you add or change a server module, route, service, repository, job handler, adapter, or port; whenever you move logic between routes/service/repository; when a Fastify handler, Drizzle query, Zod contract, or external SDK (Octokit, OpenAI, Anthropic, simple-git) is being wired into a feature; and when reviewing a backend diff or PR for layering, "where should this code live", coupling, or testability — even if the user never says "onion" or "architecture". Not for `client/`, `reviewer-core/`, or `e2e/`.
---

# Onion Architecture for DevDigest server modules

The one rule everything else follows from: **source-code dependencies point inward only.**
Inner rings (domain types, pure logic, use cases) never import outer rings (Fastify, Drizzle,
SDKs, the container). Outer rings depend on inner ones and implement the interfaces (ports)
the inner rings declare.

Why this matters here, concretely:
- Services that only see ports are testable with `src/adapters/mocks.ts` — hermetic, no
  Docker, no keys (see `TESTING.md`). A service that touches `db` or `octokit` directly forces
  every test of it to become an `*.it.test.ts`.
- Tenancy (`workspaceId` scoping) lives in repositories. SQL written in a route handler has
  to re-implement that guard by hand, and eventually one forgets.
- Contracts in `@devdigest/shared` drive both server and client. If a Drizzle row leaks to the
  wire, a schema migration silently becomes an API change.

## The rings, mapped to our files ("sliced onion")

Each `server/src/modules/<name>/` is a vertical slice. Inside it, every file belongs to a ring.
We do **not** use `domain/ application/ infrastructure/` folders — the file role is the ring.

| Ring | Files | May import | Must not import |
|---|---|---|---|
| 1 Domain model | `domain.ts` (optional), pure functions in `helpers.ts`, `status.ts`, `cost.ts`, `findings-summary.ts`; types from `@devdigest/shared` | `@devdigest/shared`, other ring-1 code | `fastify`, `drizzle-orm`, `db/**`, `adapters/**`, `platform/container`, any SDK |
| 2 Ports | adapter interfaces in `vendor/shared/adapters.ts`; server-only ports in `src/adapters/<name>/index.ts` (e.g. `DepGraph`, `Tokenizer`); module-local `interface XRepo` / `type XDeps` | ring 1 | anything concrete |
| 3 Application | `service.ts`, `run-executor.ts`, job handlers, `findings.ts` | rings 1–2, `platform/errors.ts` | `fastify`, `drizzle-orm`, `db/schema`, concrete adapters, SDKs |
| 4 Infrastructure / UI | `repository.ts`, `repository/*.repo.ts` (Drizzle), `routes.ts` (Fastify), `src/adapters/**`, `platform/container.ts`, `app.ts` | everything inward | another module's `service.ts` / `repository.ts` directly |

`platform/container.ts` is the **composition root**: the only place that knows which concrete
adapter backs which port. `ContainerOverrides` is how tests swap them.

## Workflow for a new feature (inside → out)

1. **Contract** — request/response Zod schemas in `@devdigest/shared` first
   (`server/src/vendor/shared`), then port the targeted diff to `client/src/vendor/shared`.
   See `references/zod-contracts.md`.
2. **Domain** — types (`z.infer<…>` or plain TS) and pure functions: validation rules,
   derivations, mappings. No I/O. Put them in `helpers.ts` or `domain.ts`.
3. **Ports** — what the use case needs from the outside, expressed as an interface in the
   domain's language (`findByFullName`, not `select … where`). Reuse an existing port from
   `vendor/shared/adapters.ts` before inventing one.
4. **Service** — the use case. Takes its collaborators through the constructor, orchestrates
   domain + ports, throws `AppError` subclasses. No HTTP, no SQL.
5. **Repository** — Drizzle implementation of the persistence port. Scopes every query by
   `workspaceId`, maps rows to domain/DTO shapes, translates driver errors.
   See `references/drizzle.md`.
6. **Routes** — Fastify plugin: Zod `schema` on the route, `getContext`, one service call,
   status code. See `references/fastify.md`.
7. **Wire** — one import + entry in `modules/index.ts`; new adapters/shared repos get a lazy
   getter + override in `container.ts`. See `references/ports-adapters.md`.
8. **Tests** by ring — see `references/testing.md`.

For trivial CRUD, steps 2–3 can be nearly empty and the service thin. That is fine: onion is
about the *direction* of dependencies, not about the number of files.

## Rules

- **Drizzle stays in the repository.** `drizzle-orm` and `db/schema` are imported only by
  `repository.ts` / `repository/*.repo.ts` and `src/db/**`. A route or service that needs data
  calls a repository method; add one if it doesn't exist.
- **Fastify stays at the edge.** `fastify` / `FastifyRequest` appear only in `routes.ts`,
  `app.ts`, `platform/**`, and `modules/_shared/context.ts`. Services receive plain values
  (`workspaceId`, `userId`, parsed body), never `req`/`reply`.
- **SDKs stay in adapters.** `octokit`, `openai`, `@anthropic-ai/sdk`, `simple-git`,
  ripgrep, ast-grep are used only under `src/adapters/**` (or `reviewer-core`), behind a port.
- **New services get narrow dependencies.** Pass `{ repo, jobs, git, secrets, … }` (ports)
  into the constructor rather than the whole `Container`. Passing `Container` turns it into a
  service locator: the real dependencies become invisible and tests must build a full
  container. Existing services that take `Container` stay as they are unless you're already
  reworking them.
- **Repositories return domain/DTO shapes, not query builders.** Row types
  (`$inferSelect`, `db/rows.ts`) are allowed inside the repository and its mapping helper;
  don't let a new service or route signature be expressed in row types.
- **Cross-module access goes through the container or a port.** Use `container.agentsRepo`,
  `container.reviewRepo`, `container.repoIntel` — never `import … from '../other-module/service'`.
- **Errors are domain errors.** Inner rings throw `NotFoundError`, `ValidationError`,
  `ConfigError`, `ExternalServiceError`, or `AppError(code, msg, status)` from
  `platform/errors.ts`; the shared error handler in `app.ts` owns the HTTP envelope.
  See `references/errors.md`.
- **Parse at the boundary.** Input is parsed by the route schema, external responses by the
  adapter. Inner rings work with typed values and never call `Schema.parse(req.body)`.

## Known deviations in the current code

These predate the skill. Don't copy them and don't deepen them. When you already have to change
one of these files for your task, move the touched query into a repository (boy-scout rule).
Don't mass-refactor them unless the user asks.

- SQL in route handlers: `modules/pulls/routes.ts`, `modules/settings/routes.ts`,
  `modules/polling/routes.ts`, `modules/workspace/routes.ts`; `settings/feature-models.ts` also
  queries directly.
- Schema/row types in inner files: `repos/helpers.ts`, `reviews/findings-summary.ts`,
  `reviews/diff-loader.ts`, `reviews/run-executor.ts` import `db/schema` (mostly for
  `$inferSelect` types).
- Services take `Container` (`RepoService`, `ReviewService`, `AgentsService`, …) and build
  their own repositories in the constructor.

If your task touches one of these, name the deviation in one line before acting, the same way
`CLAUDE.md` asks you to name an applicable INSIGHTS entry.

## Before you finish: review checklist

Run this on your diff (and exclude `server/clones/**` from any search):

```sh
# Drizzle / schema outside the persistence ring (only the known deviations should show)
grep -rnE "from 'drizzle-orm'|db/schema" server/src/modules \
  --include=routes.ts --include=service.ts --include=helpers.ts --include=domain.ts
# Fastify outside the edge
grep -rn "from 'fastify'" server/src/modules --include=service.ts --include=repository.ts
# SDKs outside adapters
grep -rnE "from '(octokit|openai|@anthropic-ai/sdk|simple-git)'" server/src/modules
```

Then check:
1. Every new file has a clear ring, and its imports only point inward.
2. The route handler is: schema → `getContext` → one service call → status. No branching business logic.
3. Every repository query is scoped by `workspaceId` (or documents why not, like `workspaceIdFor`).
4. New external I/O has a port, an adapter, a mock in `mocks.ts`, and a container getter + override.
5. Contract changes landed in `vendor/shared` first, and only the targeted diff went to the client copy.
6. The service has a hermetic test with mocked ports; the repository has an `*.it.test.ts`.
7. No new service takes the whole `Container`.

When reviewing someone else's diff, report violations by ring ("service imports `drizzle-orm`
→ ring 3 depending on ring 4") with the file:line and the concrete fix.

## Reference files — read when relevant

- `references/fastify.md` — writing or changing `routes.ts`, plugins, route tests with `inject`.
- `references/drizzle.md` — repositories, row→domain mapping, transactions, driver errors.
- `references/zod-contracts.md` — adding/changing a request or response shape.
- `references/ports-adapters.md` — any new external service, SDK, or shared repository.
- `references/errors.md` — choosing or adding an error type.
- `references/testing.md` — which test goes in which ring and file.
- `references/examples.md` — good/bad pairs taken from this codebase. Read when unsure.
- `references/sources.md` — the articles this is based on, for the "why" behind a rule.

Related skills: `fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `typescript-expert`.
Record non-obvious layering decisions with `engineering-insights` (in `server/INSIGHTS.md`).
