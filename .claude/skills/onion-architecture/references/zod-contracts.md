# Zod: contracts are the core's vocabulary, parsing happens at the edge

`@devdigest/shared` (vendored at `server/src/vendor/shared`) is the innermost, shared ring:
every package depends on it, and it depends on nothing but `zod`. The same schema validates
requests and serializes responses.

## Rules

- **Contract first.** A new or changed request/response shape goes into
  `server/src/vendor/shared/contracts/*.ts` first, and then into consumers. After that, port
  **only the targeted diff** to `client/src/vendor/shared`. The two copies have already drifted,
  so copying whole files reverts unrelated changes (see `server/INSIGHTS.md`,
  2026-09-15). Run `diff -rq server/src/vendor/shared client/src/vendor/shared` before and after.
- **Parse, don't validate, and do it once, at the boundary.**
  - HTTP input: `schema: { body, params, querystring }` on the route
    (`fastify-type-provider-zod`). Handlers receive typed `req.body`.
  - HTTP output: `schema: { response }` or the DTO type from `z.infer`. Serialization errors are
    caught by the shared handler (500, never leaks the raw object).
  - External data (GitHub payloads, LLM structured output, JSON columns): parsed in the
    **adapter** or repository that received it, so the inner rings get typed values.
- **Inner rings take typed values, not `unknown`.** A service signature like
  `add(workspaceId: string, userId: string, url: string)` or `(input: RepoInput)` is right;
  `add(body: unknown)` followed by `RepoInput.parse(body)` inside the service is the old
  pattern that the error handler still tolerates for legacy code.
- **Domain rules may use Zod too**, e.g. a `refine` for a business invariant in a
  `domain.ts` schema. That is fine because Zod is a ring-1 dependency here. What's not fine is
  importing Fastify or Drizzle to express the rule.
- **Contracts are not rows.** Don't `createSelectSchema(t.repos)` as an API contract. That
  makes the DB schema the API. Map rows to the contract in the repository/helper (`toRepoDto`).

For Zod API details (refinements, `safeParse`, error formatting) use the `zod` skill.
