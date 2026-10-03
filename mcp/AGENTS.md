# mcp (`@devdigest/mcp`) — agent notes

**npm, not pnpm.** This package has its own `package-lock.json`.

## Commands

```sh
npm test           # vitest, hermetic — FakeDevDigestApi, no network, no DB
npm run typecheck  # tsc --noEmit — this IS the build; the package emits no JS
npm run inspect    # MCP Inspector against the real stdio server
```

## Conventions

- **Thin adapter, no business logic.** This package has no DB access and no
  reviewer logic of its own — it shapes and fences `@devdigest/api` (`server/`,
  `:3001`) responses for a model. New data means a new API route, contracts
  first in `@devdigest/shared`, then a port method here.
- Consumed and run as TypeScript source via `tsx` — never add a build step or
  import from `dist`.
- The package mirrors the onion (ring rules from `.claude/skills/onion-architecture`,
  applied here even though that skill targets `server/`):
  - Ring 1 (pure): `src/format/*` — shaping, truncation, the untrusted fence,
    result builders. No I/O, no logging.
  - Ring 2 (port): `src/api/port.ts` (`DevDigestApi`), `src/api/errors.ts`
    (`ApiError`).
  - Ring 3 (application): `src/tools/*` — tool handlers, `resolve-repo.ts`,
    `_handler.ts`, `_register.ts`.
  - Ring 4 (adapters/edge): `src/api/http.ts` (fetch), `src/config.ts` (env),
    `src/log.ts` (stderr), `src/server.ts` (SDK registration), `src/index.ts`
    (composition root: config → adapter → server → stdio).
  - Tools never import `http.ts`, `config.ts`, or `fetch` directly; tests swap
    the port with `test/fakes.ts#FakeDevDigestApi`.
- **Package rules** (cross-cutting, every tool):
  - Log to stderr only (`src/log.ts`).
  - `process.env` is read only in `src/config.ts`.
  - `fetch` appears only in `src/api/http.ts`.
  - Tools depend on the `DevDigestApi` port, never on `http.ts` directly.
  - Tool descriptions are ≤300 chars, start with a verb, and say what to call
    next. Schemas are flat inline zod v3 shapes, no `$defs`/`$ref`. A no-param
    tool uses a real `z.object({}).strict()` so the JSON schema comes out
    `additionalProperties:false`.
  - Every success returns `outputSchema` + `structuredContent`, plus the same
    JSON in a text block (`okResult`/`untrustedResult` in `src/format/result.ts`).
  - Errors come back as `isError: true` with actionable text, never a protocol
    error, except for a genuinely malformed request.
  - PR/LLM-derived output goes through `wrapUntrustedJson`
    (`src/format/untrusted.ts`) before it reaches the model. `Agent.system_prompt`
    and `Repo.clone_path` are never returned by any tool.
- Contracts (`Agent`, `Repo`, `RunDetail`, `StartRunResponse`, `ConventionsState`,
  …) come from `@devdigest/shared`, aliased to `server/src/vendor/shared`. Change
  them there first.
- Tool registration goes through `src/tools/_register.ts#registerTool`, not
  `McpServer.registerTool` directly — see the Gotchas below and `mcp/INSIGHTS.md`.

## Gotchas

- **`tsc` can explode on `McpServer.registerTool`'s own generics** with zod
  ^3.25 + SDK ^1.30 (`TS2589`, sometimes a V8 heap OOM on a full build), and
  whether a given call trips it depends on *other* files in the same
  compilation, not just that call's shape. Always register tools through
  `src/tools/_register.ts#registerTool`, which casts to a small hand-written,
  non-generic signature. Don't call `server.registerTool` directly. See
  `mcp/INSIGHTS.md`.
- **The SDK always emits `"$schema": "…draft-07…"` on every tool schema**, and
  `zod-to-json-schema` has no option to suppress it. `src/server.ts` calls
  `stripJsonSchemaMetaFromToolsList` last, after every tool is registered — do
  the same if you add a way to register tools outside `createServer`.
- **`tools/list` has a hard character budget** (`test/tools-list.test.ts`,
  currently 8000 chars for all 5 tools). Adding a tool, a param, or a
  `.describe()` can blow it — rerun that test before shipping a new tool or
  schema change.

## Read when

- Read `specs/`, `docs/plans/mcp-server-plan.md` (via `specs/README.md`), and
  `INSIGHTS.md` first for what's already intended, tried, or rejected here.
  Record non-obvious findings with the `engineering-insights` skill.
- Read `README.md` for the tool table, the flow, env vars, error messages, and
  the token-budget rules.
- Read `../TESTING.md` when adding a test or touching CI.
