# Next.js App Router — architecture

Placement and layering for App Router projects. For how RSC works and the full list of file conventions, see `next-best-practices`. Source numbers refer to [../README.md](../README.md).

## 1. `app/` is the routing layer

Next.js does not impose a code layout. It documents three layouts and says to pick one and stay consistent. [#1]

| Strategy | Layout | When |
|---|---|---|
| Outside `app/` | `app/` has only routing files; code lives in `src/features`, `src/components`, ... | Many features reused across routes, or a team that prefers Bulletproof-style `features/` [#11] |
| Top-level inside `app/` | `app/_components`, `app/_lib` | Small apps |
| **Split by feature/route** (default here) | Shared code in `src/components`, `src/lib`; route-specific code in `app/<route>/_components`, `_lib`, `_hooks` | Most feature-per-page apps. Maximizes colocation [#13] |

Routes compose and features implement. `page.tsx` and `layout.tsx`:
- read `params` and `searchParams`
- fetch or prefetch, or call the DAL
- pick the view
- render feature components

Business logic and large JSX belong in the feature. [#28]

## 2. Private folders and route groups

- `_folder` opts the folder and everything under it out of routing. Use it for `_components`, `_lib`, `_hooks`. It marks implementation detail, sorts together in editors, and avoids clashes with future Next.js file names. [#1]
- `(group)` organizes routes or gives a subset a shared layout without changing the URL, e.g. `(marketing)`, `(app)`, `(auth)`. [#1]
- A route becomes public only when it has a `page` or `route` file. Other files in the folder are never served. [#1]

## 3. Server/client boundary is a module-graph decision

- `"use client"` makes that file **and everything it imports** part of the client bundle. [#3]
- Put it on the smallest interactive leaf (a toggle, a form, a chart), not on the page. [#2]
- To put server-rendered UI inside a client wrapper, pass it as `children` or another prop. Don't import it. Passed components are not pulled into the client graph. [#2]
- Shared pure modules (domain functions, constants, types) should run in both environments: no `window`, no secrets. That's one more reason business rules are plain TS. [#17]

```
app/dashboard/page.tsx              ← Server Component: calls DAL, composes
app/dashboard/_components/
  StatsGrid/StatsGrid.tsx           ← Server Component (pure render of DTO)
  RangePicker/RangePicker.tsx       ← "use client" leaf
  ChartShell/ChartShell.tsx         ← "use client", receives server content as children
```

## 4. Data Access Layer (DAL)

Next.js recommends that all server-side data access go through one server-only layer. [#4, #5, #30]

```
src/server/                 (or src/data/, src/lib/dal/)
  db.ts                     ← client instance; import 'server-only'
  auth.ts                   ← getCurrentUser(), cached per request
  agents.ts                 ← getAgent(id), listAgents(), archiveAgent(id)
```

Every DAL module:
- **Starts with `import 'server-only'`.** An accidental import from a client file then fails the build instead of leaking secrets.
- **Checks authorization itself.** It does not trust that the caller checked.
- **Returns DTOs**: the minimal fields the UI needs, never raw DB rows. That keeps secrets and internal columns out of RSC payloads.
- **Is the only place** that reads secrets or env vars for data access.

Pages, Server Components, Route Handlers and Server Actions call the DAL. Nothing else touches the DB.

## 5. Server Actions

- A Server Action is a public HTTP endpoint. Treat it like one. [#4, #30]
- Keep it thin:
  1. parse and validate the input (Zod)
  2. call the DAL (which checks authorization)
  3. `revalidatePath` / `revalidateTag`
  4. return a serializable result
- **Placement:** put `actions.ts` (file-level `"use server"`) next to the feature that uses it, e.g. `app/agents/[id]/_lib/actions.ts` or `src/features/agents/actions.ts`. An app-wide `actions/` folder spreads a feature across the tree. [#12, #13]
- Business rules stay in domain functions or the DAL, so the same rule serves the action, a route handler and tests.

## 6. Route Handlers vs Server Actions vs external API

| Need | Use |
|---|---|
| A mutation triggered from your own UI | Server Action |
| An endpoint for webhooks, third parties or non-React clients | Route Handler (`route.ts`) |
| A separate backend already exists (e.g. Fastify) | Neither. Use a typed client API module plus query hooks, and keep the Next.js layer as UI only. |

## 7. When to reach for Feature-Sliced Design

FSD [#28] replaces the ad-hoc folders with strict layers: `app → views → widgets → features → entities → shared`. The Next.js adaptation keeps `app/` for routing and moves page logic into a `views` layer.

Consider it only when:
- there are many features sharing real domain entities
- several teams work in the codebase
- the team will enforce the layers with lint

Otherwise feature folders + colocation give most of the benefit with less ceremony.
