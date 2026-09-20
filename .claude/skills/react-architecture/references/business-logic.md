# Business logic & the data layer

Where logic lives, and how to get it out of components. Source numbers refer to [../README.md](../README.md).

## The layers

Layer names from Juntao Qiu's article on martinfowler.com [#17] and Kettmann's series [#20]:

| Layer | Holds | Knows about React? | Knows about HTTP? | Lives in |
|---|---|---|---|---|
| **View** | JSX, event wiring, local UI state (open/closed, input text) | yes | no | `Name.tsx` |
| **Orchestration hook** | Composing queries and mutations, local state machines, calling domain functions | yes | no, it calls the API layer | `useName.ts` next to the component, or feature `hooks/` |
| **Domain** | Pure rules and derivations: `isStale(run)`, `computeSeverityDelta(a, b)`, `canArchive(agent, user)` | no | no | `helpers.ts` / `lib/<noun>.ts` in the feature |
| **API / data** | URLs, fetch, error normalization, DTO → domain mapping, query keys and options | no, apart from thin query hooks | yes | `lib/api.ts` + `lib/hooks/<domain>.ts`, or feature `api/` |

The dependency rule points inward: a view may import a hook, a hook may import domain and API code, and domain code imports nothing from the outer layers. Because domain functions have no React or fetch dependency, they are unit-testable in isolation and reusable on the server. [#17]

## Recognizing logic that is in the wrong place

| Smell in a component | Move it to |
|---|---|
| `useEffect` that computes something from props or state and `setState`s it | Compute during render with a domain function [#9] |
| `fetch(...)` / `axios` inside a component or `useEffect` | API module + query hook [#18, #24] |
| `useState(data)` initialized from query data, then kept in sync | Read `data` directly, derive, or use `select` [#24] |
| `if/else` business rules mixed into JSX (`status === 'x' && count > 3 && ...`) | A named domain function (`needsAttention(run)`) [#17] |
| Mapping or renaming API fields inside JSX (`item.created_at` → date string) | API layer mapper or `select` [#20] |
| The same filter or sort logic copied into two components | One domain function in the feature. Promote it to shared `lib/` when a second feature needs it [#12, #16] |
| A component switching on `variant` across most of its body | Split into separate components, or use composition [#31, #32] |
| Logic that runs after a user action, placed in an effect | The event handler [#9] |

## Server state vs client state

- **Server state** is remote, shared and possibly stale: lists, entities, runs. It belongs to TanStack Query, and the cache is the source of truth. [#15, #24]
- **Client state** is ephemeral UI: which tab, is the modal open, draft input. `useState`/`useReducer` at the lowest common owner. [#10, #14]
- **URL state**: filters, sort, pagination, selected id. Read it from search params so links and back/forward work.
- **Global client state** (context or store) is for truly app-wide UI (theme, current repo) and nothing else. Try composition first. [#15]

## Query organization (TanStack Query)

Colocate the key, the fetcher and the options per domain so every consumer, invalidation and prefetch shares one definition. [#25, #26]

```ts
// lib/hooks/runs.ts  (or features/runs/api/queries.ts)
export const runKeys = {
  all: ["runs"] as const,
  list: (repoId: string) => [...runKeys.all, "list", repoId] as const,
  detail: (id: string) => [...runKeys.all, "detail", id] as const,
};

export const runQueries = {
  list: (repoId: string) =>
    queryOptions({ queryKey: runKeys.list(repoId), queryFn: () => api.get<Run[]>(`/repos/${repoId}/runs`) }),
};

export const useRuns = (repoId: string) => useQuery(runQueries.list(repoId));
```

- Components call `useRuns`, never `useQuery({ queryKey: [...] })` inline. The hook is the feature's public API for that data. [#24]
- Mutations live in the same file and invalidate through `runKeys`, so a key rename cannot silently break invalidation.

## Refactoring order for a "god component"

Each step is a safe commit. The ordering follows Qiu's refactoring journey [#17]:

1. **Extract pure functions** out of the component body: derivations, formatting, rules. Test them directly.
2. **Move data access** into a query or mutation hook over the API layer. The component now gets `data`, `isLoading`, `error`.
3. **Extract an orchestration hook** if state and handlers still dominate the component (`useCompareRuns()` → `{ rows, selected, toggle, ... }`).
4. **Split the JSX** into named child components that receive props. Keep them free of data access.
5. **Name the domain.** If several functions orbit one noun (`Run`, `Finding`), group them into `lib/run.ts`. Use classes only where behavior truly varies polymorphically (strategy per country or provider). [#17]
