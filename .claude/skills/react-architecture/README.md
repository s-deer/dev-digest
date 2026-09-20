# react-architecture — sources

This skill covers **architecture only**: where code lives, how it is split, which way dependencies point, and where business logic and server code belong. It does not cover performance, hooks anti-patterns or render bugs; those live in [`react-best-practices`](../react-best-practices/SKILL.md). It does not cover Next.js file conventions or RSC mechanics; those live in [`next-best-practices`](../next-best-practices/SKILL.md).

Every rule in `SKILL.md` and `references/*.md` cites a source by number, e.g. `[#11]`. This file is the index for those numbers. When a rule and its source disagree, the source wins; fix the rule.

Baseline model: **feature folders + colocation** (Bulletproof React, Robin Wieruch, Next.js docs). Feature-Sliced Design is kept as a reference for larger apps, not the default.

## Question → sources

| Question | Primary | Supporting |
|---|---|---|
| Where do components live? | #1, #11, #12 | #19, #21, #28 |
| How do I split a component? | #6, #8, #31 | #22, #23, #32 |
| Where do constants go? | #12, #21 | #11 |
| Utils vs helpers: what goes where? | #21, #12 | #11, #16 |
| Where does business / domain logic go? | #17, #20 | #8, #9, #22 |
| Where does server state and the API layer go? | #24, #25, #26 | #18, #20, #15 |
| Where does state live? | #10, #14 | #15 |
| Next.js: routes, `_private`, `"use client"`, DAL, Server Actions | #1, #2, #3, #4, #5 | #28, #30 |
| When should I abstract / promote to shared? | #16, #12, #13 | #11 |
| Barrel files (`index.ts`)? | #11, #27 | #29 |
| How are boundaries enforced? | #11, #33 | #34 |

## Tier 1 — Official (Next.js / React)

| # | Source | What we take from it |
|---|---|---|
| 1 | [Next.js — Project structure & organization](https://nextjs.org/docs/app/getting-started/project-structure) | Files inside `app/` can be colocated safely. Covers `_private` folders, `(route groups)` and `src/`. Offers 3 strategies (keep code outside `app/`, in top-level folders inside `app/`, or split by feature/route) and says to pick one and stay consistent. |
| 2 | [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | Push `"use client"` down to the leaves. Pass Server Components to Client Components as `children`. |
| 3 | [Next.js — Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) | `"use client"` marks a module-graph boundary, not just a label. Everything a client file imports ships to the client. |
| 4 | [Next.js — Data Security](https://nextjs.org/docs/app/guides/data-security) | A server-only Data Access Layer (DAL) that checks authorization and returns minimal DTOs. Server Actions stay thin. |
| 5 | [Next.js blog — How to Think About Security in Next.js](https://nextjs.org/blog/security-nextjs-server-components-actions) | Why the DAL exists. The `server-only` package. |
| 6 | [React — Thinking in React](https://react.dev/learn/thinking-in-react) | Split the UI into a component hierarchy along single responsibilities. Keep state minimal. |
| 7 | [React — Keeping Components Pure](https://react.dev/learn/keeping-components-pure) | Render is a pure calculation. Side effects belong in handlers. |
| 8 | [React — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | Custom hooks are how logic gets extracted. A component should read as intent, not implementation. |
| 9 | [React — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | Derive values during render. Logic goes in handlers or pure functions, not effects. |
| 10 | [React — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) · [Sharing State Between Components](https://react.dev/learn/sharing-state-between-components) | Where state lives: lift it only as high as the shared owner. |

## Tier 2 — Canonical architecture references

| # | Source | What we take from it |
|---|---|---|
| 11 | [Bulletproof React — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) ([repo](https://github.com/alan2207/bulletproof-react)) | Layout: `src/{app,components,config,features,hooks,lib,stores,types,utils}`. Feature subfolders are `api/components/hooks/stores/types/utils`, created only as needed. Features never import from other features. Dependencies flow shared → features → app, enforced by lint. No barrel files. |
| 12 | [Robin Wieruch — React Folder Structure (2026)](https://www.robinwieruch.de/react-folder-structure/) | Growth path: file → component folder → technical folders → features → domains → monorepo. Single-use hooks and constants stay local and move to shared once a second feature needs them. Removing a feature should break only the pages that use it. |
| 13 | [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) | "Place code as close to where it's relevant as possible." |
| 14 | [Kent C. Dodds — State Colocation](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | Keep state next to the component that uses it. |
| 15 | [Kent C. Dodds — Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) | Server cache is separate from UI state. Try composition before context. |
| 16 | [Kent C. Dodds — AHA Programming](https://kentcdodds.com/blog/aha-programming) | Avoid hasty abstractions: duplication is cheaper than the wrong abstraction. |
| 17 | [Juntao Qiu (martinfowler.com) — Modularizing React Applications with Established UI Patterns](https://martinfowler.com/articles/modularizing-react-apps.html) | Layers: view → hooks/state → domain model → network. A step-by-step refactor that moves business logic out of components. |
| 18 | [martinfowler.com — Data Fetching Patterns in Single-Page Applications](https://martinfowler.com/articles/data-fetch-spa.html) | Where fetching logic belongs, and how it relates to the component tree. |
| 19 | [Profy.dev — Popular React Folder Structures and Screaming Architecture](https://profy.dev/article/react-folder-structure) · [dev.to mirror](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25) | Folders should name the domain, not the framework. Avoid dumping-ground folders. |
| 20 | Johannes Kettmann (Profy.dev) — *Path to a Clean(er) React Architecture*: [API layer & data transformations](https://profy.dev/article/react-architecture-api-layer-and-data-transformations) ([mirror](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-api-layer-data-transformations-1go0)) · [Domain entities & DTOs](https://profy.dev/article/react-architecture-domain-entities-and-dtos) ([mirror](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-domain-entities-dtos-3ja0)) · [Business logic separation](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection) ([mirror](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-6-business-logic-separation-221g)) · [Domain logic](https://profy.dev/article/react-architecture-domain-logic) | Pipeline: API layer → DTO → domain entity, then use cases, then domain logic. The most direct answer to "where does business logic go". |
| 21 | [Josh W. Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) | Helpers are specific to this project; utils are generic and portable. App-wide values go in `constants.ts`. One folder per component. |
| 22 | [Alex Kondov — Tao of React](https://alexkondov.com/tao-of-react/) · [Clean Architecture in React](https://alexkondov.com/full-stack-tao-clean-architecture-react/) | Rules for components, structure and business logic. |
| 23 | [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) | Historical context: the 2019 update says hooks replaced the forced container/presentational split. Cited so we *don't* require containers. |

## Tier 2 — Data layer (TanStack Query)

| # | Source | What we take from it |
|---|---|---|
| 24 | [TkDodo — Practical React Query](https://tkdodo.eu/blog/practical-react-query) | Wrap queries in custom hooks. Never copy server state into `useState`. |
| 25 | [TkDodo — Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) | One query-key factory per feature, colocated with that feature. |
| 26 | [TkDodo — The Query Options API](https://tkdodo.eu/blog/the-query-options-api) | `queryOptions` keeps the key and the fetcher together as one unit. |
| 27 | [TkDodo — Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) | What barrel files cost in tooling, bundling and circular imports. |

## Tier 2 — Next.js-specific architecture

| # | Source | What we take from it |
|---|---|---|
| 28 | [Feature-Sliced Design — Usage with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs) · [FSD overview](https://feature-sliced.design/docs/get-started/overview) | `app/` does routing only; pages assemble features. Layers, slices and segments are an alternative model for large apps (reference only). |
| 29 | [Vercel — How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js) | Why barrel files hurt specifically in Next.js. |
| 30 | [OWASP — Next.js Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Nextjs_Security_Cheat_Sheet.html) | Backs up the DAL + DTO boundary. |

## Tier 3 — Composition patterns & enforcement

| # | Source | What we take from it |
|---|---|---|
| 31 | [patterns.dev — Compound](https://www.patterns.dev/react/compound-pattern/) · [Container/Presentational](https://www.patterns.dev/react/presentational-container-pattern/) · [Hooks](https://www.patterns.dev/react/hooks-pattern/) | A catalog of patterns for splitting components. |
| 32 | [vercel-labs/agent-skills — composition-patterns](https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns) | Compound components instead of piles of boolean props. Also a format reference for agent skills. |
| 33 | [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) ([docs](https://www.jsboundaries.dev/docs/overview/)) | Enforces feature and layer boundaries as lint errors. |
| 34 | [Xebia — Taking Frontend Architecture Serious with dependency-cruiser](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/) | Dependency rules checked in CI, plus a dependency graph. |

## Considered and left out

- Generic Medium, dev.to and GeeksforGeeks posts on "folder structure best practices": they repeat #11 and #12 with less rigor.
- Scribd and paywalled copies of *Tao of React*: #22 links to the author's own pages instead.

## Maintaining this file

- When you add a rule to the skill, cite a number from this file. If no source here backs it, add the source first.
- Before adding a source, check that the URL resolves and that it says what the "What we take" column claims.
- Keep the numbering stable, because the rule files cite these numbers. Add new sources at the end.
