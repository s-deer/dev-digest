# DevDigest `client/` — how the rules apply here

Read this before placing or splitting code in `client/` (`@devdigest/web`). Where this file differs from the generic SKILL.md, **this file wins**. These are the conventions the codebase already follows.

Also read: `client/AGENTS.md` (conventions), `client/docs/data-flow.md` (the data path), `client/INSIGHTS.md` (what was already tried).

## What this app is (and isn't)

- A Next.js 15 App Router **studio UI** over a separate **Fastify API** (`server/`, `:3001`).
- **There is no Next.js server data layer.** The repo has no `server-only` module, no Server Actions and no DB access from `client/`. The "server" is the Fastify API, reached over HTTP.
  - So the DAL and Server Action rules in `nextjs-app-router.md` apply only if someone deliberately adds Next.js server code. Don't introduce any as part of a feature.
- Many pages are `"use client"` because the data is fetched client-side with TanStack Query.

## Where things go

| Thing | Location | Example |
|---|---|---|
| Route entry | `src/app/<route>/page.tsx`. Thin: reads params and renders a view. | `src/app/agents/page.tsx` → `<AgentsListView />` |
| Route-specific component | `src/app/<route>/_components/<Name>/<Name>.tsx` | `src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx` |
| Sub-component used only by one component | Nested `_components/` inside that component's folder | `AgentsListView/_components/CreateAgentModal/` |
| Component used by 2+ routes | `src/components/<kebab-name>/`, with `index.ts` as its public entry | `src/components/findings-summary/`, `src/components/diff-viewer/` |
| Generic UI primitive (Button, Skeleton, EmptyState...) | `@devdigest/ui` (`src/vendor/ui`), which is **vendored**, so don't edit it | `import { Skeleton } from "@devdigest/ui"` |
| App chrome (nav, breadcrumbs, shortcuts) | `src/components/app-shell` | |
| Data fetching or mutation | A hook in `src/lib/hooks/<domain>.ts`, built on `api` / `apiFetch` from `src/lib/api.ts` | `useAgents()` in `src/lib/hooks/agents.ts` |
| API payload types | `@devdigest/shared` (`src/vendor/shared`). Never redeclare them. | `import type { Agent } from "@devdigest/shared"` |
| Cross-app client infrastructure | `src/lib/*.ts(x)` (providers, theme, toast, repo context) | `src/lib/repo-context.tsx` |
| User-facing strings | `messages/en/<namespace>.json` + `useTranslations("<namespace>")` | `messages/en/prReview.json` |

## Inside a component folder

The established shape. Create only the files you need:

```
<Name>/
├── <Name>.tsx          # the component
├── <Name>.test.tsx     # colocated test (vitest + RTL, fetch mocked)
├── index.ts            # one-line public entry: export { Name, Name as default } from "./Name"
├── constants.ts        # constants used by this component (SCREAMING_SNAKE_CASE)
├── helpers.ts          # pure functions for this component: formatting, derivations, domain rules
├── styles.ts           # `export const s = { ... }`: CSSProperties objects, or functions returning them
└── _components/        # private sub-components, same shape recursively
```

A page can carry the same companions next to `page.tsx` (e.g. `repos/[repoId]/pulls/{constants,styles}.ts`).

**Styling** uses colocated `styles.ts` objects referencing CSS variables (`var(--border)`, `var(--accent)`). This is the existing convention, so follow it for new components instead of introducing a new styling approach.

## Promotion path

1. It starts in the component's own `helpers.ts` / `constants.ts`.
2. A sibling component in the same route needs it: move it up to the nearest shared parent folder (e.g. the route's `_components/<Parent>/helpers.ts`, or a file next to `page.tsx`).
3. A second route needs it: move it to `src/components/<name>/` (for UI together with its helpers).
   - Example: `formatUsd` lives in `src/components/run-cost-badge/helpers.ts` and is the single formatter for cost everywhere. Reuse it instead of writing another.
4. It is truly generic, with no domain meaning: move it to `src/lib/`.

Before creating a helper, search `src/components/*/helpers.ts` and `src/lib/` for an existing one.

## Data layer rules (from AGENTS.md, enforced in review)

- Components never call `fetch`. Every call goes component → `src/lib/hooks/*` → `src/lib/api.ts` → API.
- Server state lives in TanStack Query. **Do not copy it into `useState`**. Derive from `data` during render.
- New endpoint:
  1. Add or update the contract in `@devdigest/shared` first. That change is server-side first.
  2. Add a hook in the matching `src/lib/hooks/<domain>.ts`.
  3. Use the hook in the component.

## Known deviations from the generic skill (don't mass-refactor)

- `src/lib/hooks/index.ts` is an aggregating barrel (`export * from "./agents"`, ...). Existing imports from `@/lib/hooks` are fine.
  - In **new** code, prefer the domain file (`@/lib/hooks/agents`), which is explicitly supported.
- Query keys are inline arrays (`["agents"]`, `["agent", id]`), not key factories or `queryOptions`.
  - When adding hooks to a domain file, match the key shapes already used there so invalidation keeps working.
  - Introducing a per-domain key factory is reasonable when a domain file gets many related queries. Do it in its own change.
- Some pages (e.g. `repos/[repoId]/pulls/page.tsx`) are still fat client pages, not thin routes.
  - When you touch one substantially, extracting its body into a `_components/<Name>View/` (like `AgentsListView`) is the preferred direction. Don't do it in unrelated changes.
