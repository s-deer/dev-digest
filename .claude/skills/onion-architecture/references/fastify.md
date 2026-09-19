# Fastify: routes are a driving adapter (ring 4)

A route translates HTTP into a use-case call and the result back into HTTP. It owns:
validation (via the Zod type provider), tenancy context, status codes. It owns nothing else.

## Shape of a handler

```ts
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new RepoService(app.container);   // built once per plugin registration

  app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const { repo, created } = await service.add(workspaceId, userId, req.body.url);
    reply.status(created ? 201 : 200);
    return repo;
  });
}
```
(`server/src/modules/repos/routes.ts` is the reference module.)

- **Schema on the route, not in the handler.** `schema: { body, params, querystring, response }`
  with schemas from `@devdigest/shared` or `modules/_shared/schemas.ts` (`IdParams`). Invalid
  input becomes a `422` before the handler runs. Hand-rolled `Schema.parse(req.body)` skips
  that and changes the error envelope.
- **`getContext(app.container, req)`** is how the route gets `workspaceId`/`userId`. Pass those
  values into the service. Don't pass `req`: that would make ring 3 depend on Fastify.
- **One service call per handler** is the norm. If the handler needs `if`/loops over data, a
  second repository call, or a `Promise.all` of several queries, that orchestration is a use
  case, so move it into the service.
- **Status mapping only.** "created vs existed → 201/200" belongs here. "Not found → 404" does
  not: the service throws `NotFoundError` and the shared error handler maps it.

## Plugins and encapsulation

- Each module is an encapsulated Fastify plugin registered in `modules/index.ts`.
  Cross-cutting plugins (helmet, cors, rate-limit, SSE) and the error handler are registered in
  `app.ts` **before** modules so every module inherits them.
- Use plugins/decorators for transport concerns (auth hooks, SSE, headers). Don't use
  `app.decorate` as a second DI container for domain services. Dependencies are wired in
  `platform/container.ts` (the composition root) and reach the route through `app.container`.
- SSE / streaming routes follow the same rule: the route adapts a domain event stream
  (`container.runBus`) to the wire. It doesn't compute what to stream.

## Testing routes

- Build the app with `buildApp({ config, overrides })` and call `app.inject(...)`. Overrides
  are `ContainerOverrides` (mocks from `src/adapters/mocks.ts`), so route tests stay hermetic
  when they don't hit the DB (`test/routes-smoke.test.ts`).
- DB-backed route flows go in `*.it.test.ts` (testcontainers). See `testing.md`.

## Smells

| Smell | Fix |
|---|---|
| `import { eq } from 'drizzle-orm'` in `routes.ts` | Add a repository method and call it via the service |
| `container.db.select()` in a handler | Same |
| `await (await container.github()).listPullRequests(...)` in a handler | Move it to the service, which depends on the `GitHubClient` port |
| `reply.status(404).send(...)` for a missing entity | `throw new NotFoundError()` in the service |
| Handler > ~15 lines | Orchestration leaked out of the service |
