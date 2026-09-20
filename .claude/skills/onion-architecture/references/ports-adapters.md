# Ports, adapters, and the composition root

**Port** = an interface owned by the inner rings, named for what the use case needs.
**Adapter** = a concrete implementation that plugs a technology into that port.
**Composition root** = the single place that decides which adapter backs which port:
`server/src/platform/container.ts`.

## Where things live

| Thing | Location |
|---|---|
| Ports shared with client/reviewer-core | `server/src/vendor/shared/adapters.ts` (`LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, `SecretsProvider`, `AuthProvider`) |
| Server-only ports | `src/adapters/<name>/index.ts` next to the implementation (`DepGraph`, `Tokenizer`), or a module-local `types.ts` facade (`repo-intel/types.ts` → `RepoIntel`) |
| Real adapters | `src/adapters/<name>/<impl>.ts` (`github/octokit.ts`, `git/simple-git.ts`, `llm/openai.ts`, …) |
| Test adapters | `src/adapters/mocks.ts` (`MockGitHubClient`, `MockLLMProvider`, `MockGitClient`, …) |
| Wiring | `platform/container.ts`: lazy getter + `ContainerOverrides` field |

## Adding new external I/O (checklist)

1. **Port.** Define the interface in domain terms: `listOpenPulls(repo)`, not
   `request('GET /repos/{o}/{r}/pulls')`. If only the server needs it, keep it server-side. A
   change to `vendor/shared/adapters.ts` is a deliberate contract change (`CLAUDE.md`).
2. **Adapter.** Implement it under `src/adapters/<name>/`. All SDK imports, retries, rate-limit
   handling, and response parsing (Zod) live here. Throw `ExternalServiceError` / `ConfigError`,
   not SDK error types.
3. **Mock.** Add a `Mock<Name>` to `mocks.ts` so services stay hermetically testable.
4. **Container.** Add a lazy getter (sync, or `async` if it needs a secret, like `github()` /
   `llm(id)`), and an `overrides.<name>` field that wins when present. Missing keys throw
   `ConfigError` at call time; the server boots without keys by design.
5. **Consume.** Services receive the port. New services get it via the constructor; routes
   pass `app.container.<name>` (or the resolved value) when constructing the service.

## Composition root rules

- Only `container.ts` (and `app.ts` for Fastify plugins) does `new SomeAdapter(...)` for
  production code. A service that does `new OctokitGitHubClient(token)` has hard-wired an outer
  ring into an inner one.
- Keep the container **out of inner rings in new code.** It is fine for a route to read
  `app.container`; a *new* service should declare what it needs:

  ```ts
  // prefer
  export interface RenameDeps { repos: RepoRepository; jobs: Pick<JobRunner, 'enqueue'> }
  export class RenameRepo { constructor(private deps: RenameDeps) {} }

  // routes.ts
  const rename = new RenameRepo({ repos: new RepoRepository(app.container.db), jobs: app.container.jobs });
  ```

  Existing services take `Container`. That is a known deviation, and changing all of them is
  out of scope unless asked.
- **Cross-module collaboration** goes through container-owned facades/repositories
  (`agentsRepo`, `reviewRepo`, `repoIntel`) or a port. A module never imports another module's
  `service.ts` or `repository.ts` file directly. If it needs one, hoist it into the container.
- We deliberately use a hand-written container instead of `@fastify/awilix`: explicit getters are
  greppable, typed, and work the same in tsx, vitest, and the bundler. Don't introduce a DI
  framework.

## `reviewer-core`

`@devdigest/reviewer-core` is a pure engine consumed as TypeScript source. From the server's
point of view it is a domain-service library (it takes ports like `LLMProvider` as arguments).
Calling `reviewPullRequest(...)` from a service is fine. Don't let it import server code.
