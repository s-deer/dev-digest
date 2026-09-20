# Sources

What each source contributes to this skill. Links were checked on 2026-09-19. The Medium and
betterprogramming links block automated fetches but open in a browser.

## Onion Architecture and related patterns

- **Jeffrey Palermo — The Onion Architecture, part 1** (2008). The original definition:
  the domain model is at the center, all coupling points toward the center, and infrastructure
  is on the outside and replaceable.
  https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
- **Palermo — part 2**. Walkthrough of the rings (domain model → domain services →
  application services → UI/infrastructure/tests). This is the ring naming used in `SKILL.md`.
  https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/
- **Palermo — part 4: After Four Years**. The four tenets: the application is built around an
  independent object model; inner layers define interfaces and outer layers implement them;
  coupling points toward the center; core code can be compiled and run separately from
  infrastructure.
  https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/
- **Palermo's original sample (fork)**. Reference project structure.
  https://github.com/Jordiag/Jeffrey-Palermo-Onion-Architecture
- **Herberto Graça — Onion Architecture** (Software Architecture Chronicles). Places Onion
  alongside Ports & Adapters and Clean; its "dependency direction" diagrams informed the ring table.
  https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85
- **Oliver Drotbohm — Sliced Onion Architecture**. Slice by feature first, apply the onion
  within each slice. This is the justification for keeping `modules/<name>/` and mapping files to rings
  instead of global `domain/ application/ infrastructure/` folders.
  http://odrotbohm.github.io/2023/07/sliced-onion-architecture/
- **Robert C. Martin — The Clean Architecture**. The Dependency Rule ("source code
  dependencies can only point inwards"), which is the one-line summary at the top of `SKILL.md`.
  https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- **Alistair Cockburn — Hexagonal Architecture**. Ports as purposeful conversations with
  many possible adapters. Source of the port/adapter vocabulary and the "test adapters" idea
  (`mocks.ts`).
  https://alistair.cockburn.us/hexagonal-architecture
- **Mark Seemann — Composition Root**, plus **Composition Root location**. Compose the
  object graph in one place, as close to the entry point as possible. This is the role of
  `platform/container.ts`, and it is also why services shouldn't pull from the container
  (service locator).
  https://blog.ploeh.dk/2011/07/28/CompositionRoot/ ·
  https://blog.ploeh.dk/2019/06/17/composition-root-location/
- **Martin Fowler — Repository** (PoEAA). A collection-like interface in domain terms that
  mediates between domain and data mapping. Source of "name methods in domain language".
  https://martinfowler.com/eaaCatalog/repository.html
- **Alexis King — Parse, don't validate**. Turn untyped input into typed values once, at the
  boundary. Basis for `zod-contracts.md`.
  https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/

## Tool-specific practice

- **Fastify — Plugins** (encapsulation, registration order). Why cross-cutting plugins and the
  error handler register before modules.
  https://fastify.dev/docs/latest/Reference/Plugins/
- **Fastify — Testing** (`inject`). Route tests without a network socket.
  https://fastify.dev/docs/latest/Guides/Testing/
- **@fastify/awilix**. A DI plugin we evaluated as an alternative and deliberately did not adopt
  (see `ports-adapters.md`).
  https://github.com/fastify/fastify-awilix
- **Drizzle — Transactions**. `db.transaction(async (tx) => …)`, nested savepoints, rollback.
  https://orm.drizzle.team/docs/transactions
- **João Batista da Silva — Transactions with DDD and Repository Pattern in TypeScript, part 2**.
  Transaction scope/unit of work without leaking the ORM transaction into the domain.
  https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901
- **Paul Serban — Drizzle ORM Best Practices**. Repository boundary, not leaking query builders,
  translating DB errors into domain errors.
  https://blog.paulserban.eu/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/
- **256Taras — fastify-typescript-drizzle-starter-kit**. Fastify 5 + Drizzle with
  DDD-lite/Clean-lite layering. A pragmatic reference for "lightweight by default".
  https://github.com/256Taras/fastify-typescript-drizzle-starter-kit
- **borjatur — clean-architecture-fastify-mongodb**. Clean/Onion-style Fastify template;
  useful for seeing ports and adapters on Fastify.
  https://github.com/borjatur/clean-architecture-fastify-mongodb
- **dyarleniber (dev.to) — Hexagonal Architecture and Clean Architecture (with examples)**. TypeScript
  examples of ports, adapters, and use cases.
  https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi

## For later: automated enforcement

This skill is guidance only. If we later want CI to enforce the dependency rule,
`dependency-cruiser` is already a server dependency (used by `repo-intel`):

- **dependency-cruiser — rules reference** (`forbidden` rules with `from`/`to` path patterns).
  https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- **Ken Miyashita — Validate Dependencies According to Clean Architecture**. A worked
  dependency-cruiser config for layer rules.
  https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c
