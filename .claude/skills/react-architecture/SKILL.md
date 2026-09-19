---
name: react-architecture
description: "Frontend architecture for React + Next.js App Router: where components, hooks, constants, utils/helpers, types and business logic live; how to split a component; feature folders and colocation; the API/server-state layer; Next.js server code (routes as thin composition, _private folders, 'use client' boundaries, server-only data access layer, Server Actions placement); dependency direction and boundary enforcement. Use this whenever someone asks where a file or piece of code should go, how to structure a new page/feature/module, how to break up a large component, whether something belongs in utils, lib, hooks or constants, where to put business rules or data mapping, or asks for an architecture/structure review of React or Next.js code — even if they only say 'куди це покласти', 'як розбити цей компонент', 'where should this go', or 'is this structure ok'. Not for performance, memoization, or hook bugs (use react-best-practices) or Next.js file-convention/RSC mechanics alone (use next-best-practices)."
---

# React & Next.js Architecture

This skill decides **where code goes and which way dependencies point**. Most of the time, the question behind it is "where should this go?" Answer with a concrete file path and one line of reasoning, not a survey of options.

Every rule cites a source by number, like `[#11]`. The sources are listed in [README.md](README.md). Code and tree examples are in [examples.md](examples.md).

Related skills:
- `react-best-practices` covers render-level anti-patterns.
- `next-best-practices` covers file conventions and how RSC works.

This skill covers placement and layering.

## The core idea

**Colocate by default. Promote code only when a second consumer shows up.** [#12, #13, #16]

Put code as close as possible to where it is used. Distance costs something: every hop between a component and its logic makes the code harder to read, harder to delete and harder to change safely.

Shared folders like `utils/`, `hooks/` and `components/` are for code with at least two real consumers in different features. Code does not go there because it might be reused someday. A premature abstraction costs more than a little duplication. [#16]

Deletability test: removing a feature should break only the routes that render it, and nothing else. [#12]

## Where does this code go?

Answer two questions: **who uses it**, and **what is it**.

| Who uses it | Where it goes |
|---|---|
| One component | Inside that component's folder. The same file is fine if it is tiny. |
| Several components in one feature/route | The feature folder: a `_components/`, `hooks/`, `lib/` or `constants.ts` next to the route that owns the feature. |
| Two or more features | A shared layer: `src/components`, `src/hooks`, `src/lib`, `src/utils`. |
| Every app, copied between projects | `src/utils` (generic utilities). |

| What it is | Shape |
|---|---|
| UI | Component: `Name/Name.tsx` plus a colocated `Name.test.tsx` [#21, #12] |
| Stateful or effectful logic that uses React | Custom hook `useXxx` [#8] |
| Pure business rule or calculation | Plain TS function in the feature (`lib/` or `<thing>.ts`), no React import [#17, #20] |
| Server data fetch or mutation | Query/mutation hook over an API module (client), or a DAL function (server) [#24, #4] |
| Mapping from an API shape to a UI shape | The API/data layer, never JSX [#20] |
| Constant | See [Constants](#constants) |
| Type | Next to its producer. API contract types come from the shared contract package and are never redeclared. |

## Components

**Routes compose. Features implement.** In Next.js, `page.tsx` and `layout.tsx` read params, fetch or prefetch, and assemble feature components. They do not hold feature logic or large JSX. [#1, #28, #11]
- *Why:* routing files are the least reusable and least testable code you have. Keeping them thin means a feature can move between routes without being rewritten.

**One component per folder once it has companions** (a test, styles, a local hook or helper): `ComponentName/ComponentName.tsx`. A lone small component can be a single file. [#21, #12]

**Split a component when it has more than one reason to change**, not when it passes some line count. [#6] Signals:
- Two unrelated pieces of state.
- A data-fetching concern mixed with a layout concern.
- JSX blocks you have to name in a comment ("// header", "// results table").
- Branching on a `variant` or boolean prop that changes most of the output.

Extract in this order, cheapest first:
1. **Pure functions** go outside the component body. Derived values, formatters and business rules become plain functions. [#9, #7]
2. **Custom hook** for state + effects + queries, so the component reads as intent. [#8]
3. **Child components** for named JSX regions. They receive props and hold no data access.
4. **Composition over configuration.** If props keep growing (`showHeader`, `isCompact`, `withFooter`...), use `children` or compound components instead. [#31, #32]

**Don't mandate container/presentational pairs.** Hooks already separate logic from view without an extra wrapper layer. The original author walked this pattern back. [#23, #8] Separate logic into a hook, not into a container component.

**State lives at the lowest common owner.** Lift it only as far as the nearest shared parent, and push it down again when that parent no longer needs it. [#10, #14] Server data is not UI state. It lives in the query cache and is never copied into `useState`. [#15, #24]

## Constants

- **Used in one file:** a module-level `const` at the top of that file, outside the component.
  - *Why:* no re-allocation per render, and the value stays visible next to the code that uses it.
- **Used across one feature:** `constants.ts` in the feature folder. [#12]
- **App-wide config** (limits, feature flags, route paths, env-derived values): `src/config/` or `src/lib/constants.ts`. [#11, #21]
  - Read `process.env` in exactly one module and export typed values from it.
- **Not constants:**
  - User-facing strings go in the i18n message files.
  - Design tokens belong to the design system or theme.
  - Values that come from the server belong to the API.
- **Naming:** `SCREAMING_SNAKE_CASE` for true constants. Use `as const` on objects and tuples so the literal types survive.

## Utils vs helpers vs lib

These names are often used loosely. Use them like this: [#21, #12, #11]

| Folder | Contents | Test |
|---|---|---|
| `utils/` | Generic, domain-free, pure functions (`clamp`, `groupBy`, `formatBytes`) | Could you paste it into an unrelated project unchanged? |
| Feature `lib/` or `<thing>.ts` ("helpers") | Domain-specific pure logic (`computeSeverityDelta`, `isRunStale`) | Does it mention a domain noun? Then it stays in its feature. |
| `src/lib/` | Configured infrastructure: the API client, query client, i18n setup, providers, third-party wrappers | Does it wire up a library or I/O? |

A helper used by two features moves to shared `lib/`. It does **not** move to `utils/`, because it still carries domain meaning.

A `helpers.ts` inside a component or feature folder is fine; the folder already scopes it. What rots is an **app-wide** `helpers/`, `common/` or `misc/` folder, because nothing scopes it and it becomes a dumping ground. At shared level, a file named after what it does (`severity.ts`) beats one named after what kind of thing it is. [#19]

## Business logic & data layer

Layers, from outside to inside: [#17, #20]

```
component (view)  →  hook (orchestration: queries, mutations, local state)
                  →  domain functions (pure rules, no React, no fetch)
                  →  API layer (HTTP client + DTO → domain mapping)
```

- **Business rules are plain TS functions.** They are unit-testable without rendering, and reusable on the server. [#17, #20]
- **Components never call `fetch`.** The API layer owns URLs, headers, errors and response mapping. A query hook wraps that layer for React. [#18, #24]
- **Map data at the edge.** If the server shape and the UI shape differ, transform in the API layer or in a query's `select`, not inside JSX. [#20]
- **Query keys and options live with the feature**, as a key factory or `queryOptions` object. That way invalidation and prefetching reuse the same definition. [#25, #26]
- **Effects are for syncing with external systems only.** Logic that runs because of a user action goes in the event handler. [#9]

Details and examples: [references/business-logic.md](references/business-logic.md).

## Next.js App Router

The short version. Read [references/nextjs-app-router.md](references/nextjs-app-router.md) when placing server code, Server Actions or `"use client"`.

- **Feature UI next to its route.** Use `_components/`, `_lib/` or `_hooks/` next to `page.tsx`. The `_` prefix opts the folder out of routing and marks it as private. [#1]
- **`(group)` folders** organize routes or share a layout without changing the URL. [#1]
- **`"use client"` goes at the leaves.** It marks a module-graph boundary: everything that file imports ships to the browser. Pass server-rendered content into client components as `children`. [#2, #3]
- **Server data access lives in a `server-only` Data Access Layer (DAL).** It checks authorization and returns minimal DTOs. Pages, Server Components and Server Actions call the DAL. They never call the DB or secrets directly. [#4, #5, #30]
- **Server Actions stay thin:** validate input, call the DAL, revalidate. Put them in an `actions.ts` next to the feature that uses them. [#4]

## Dependency direction

```
shared (components, hooks, lib, utils, types, config)
   ↑
features / route-private folders
   ↑
app routes (page, layout)
```

- Arrows point toward what may be imported. Shared code never imports from a feature, and a feature never imports from `app/`. [#11, #12]
- **Features don't import from each other.** If feature A needs something from feature B, either promote it to shared or compose A and B in the route. [#11]
- **Avoid aggregating barrels** (`export * from` many modules) for internal code. They hide real dependencies, create import cycles and slow tooling. Import the file directly. [#11, #27, #29]
  - A one-line `index.ts` that exposes a component folder's single entry (`export { Foo } from "./Foo"`) is fine. It is a public entry point, not a barrel.
- Enforce the direction with lint instead of relying on review memory. See [references/enforcement.md](references/enforcement.md). [#33, #34]

## When answering

- **Placement question:** give the tree with real paths. For each new file, say why it goes there, citing the rule.
- **Refactor request:** show the split as the resulting files, then the code. Keep behavior identical. Name the extraction step each piece came from (pure function, hook, child component).
- **Existing project with its own conventions:** follow them, even where they differ from this skill. Mention the difference once, and don't refactor unrelated code.
- **Working in the DevDigest repo (`client/`):** read [references/devdigest-client.md](references/devdigest-client.md) first. Its conventions override the generic defaults here.
- **Growing apps:** feature folders are the default. Mention Feature-Sliced Design [#28] only when the app has many features with real cross-feature entities and the team wants strict layers.
