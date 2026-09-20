# Severity rubric (one scale for every reviewer skill)

The skills use different scales, or none at all: `react-best-practices` and `security` have
CRITICAL/HIGH, while `onion-architecture` and `react-architecture` have none. A reviewer
**ignores the skill's own labels** and maps every finding onto this scale. Only `critical`
blocks the PR.

**If in doubt, go one level lower.** A false critical stops someone's PR, which costs more than
a missed nit.

## critical (blocks the PR)

The finding must meet **all** of these:
1. You can point at the exact added or changed line (`file:line`) in this diff. A problem in
   code the diff did not touch is never critical.
2. It breaks something concrete, not taste. The consequence falls into one of these classes:
   - **Runtime bug**: wrong result, crash, data loss or corruption, a broken React
     reconciliation (for example a `key` from an array index on a reorderable list with state),
     a stale closure that makes the UI show wrong data, an unhandled promise on a request path.
   - **Security**: injection, missing auth or tenancy (`workspaceId`) scoping, a leaked
     secret, XSS through `dangerouslySetInnerHTML` of untrusted content, command injection into
     git or shell.
   - **Dependency rule broken** (onion): a ring 1–3 file (`service.ts`, `helpers.ts`,
     `domain.ts`, …) imports `fastify`, `drizzle-orm`, `db/schema`, or an SDK. A new route
     queries Drizzle directly instead of going through a repository.
   - **Contract break**: a response or request shape changed in a consumer without the change
     landing in `@devdigest/shared` first, or a Drizzle row type leaks to the wire.
    - **Repo invariant from `AGENTS.md`**: DB access added to a hermetic `*.test.ts` or an
      applied migration hand-edited.
3. The skill has a rule that says so, and you cite it in `rule` (the section heading or rule
   name from that skill's `SKILL.md`).

## high

The code works today but will cause a bug or real pain soon. Examples: a new service takes the
whole `Container` (service locator), business logic sits in a route handler, an effect is missing
a cleanup, a data-fetching hook ignores its error state, a missing index on a new foreign key
that is queried.

## medium

Structure and maintainability. Examples: a file sits in the wrong folder under
`react-architecture`, a component is too big and should be split, a derived value is stored in
state, a Zod schema is duplicated instead of reused.

## low

Nits: naming, a comment, a slightly better idiom.

## Not a finding

Leave these out, don't downgrade them:
- Anything listed in the package's `INSIGHTS.md` as a deliberate decision.
- Anything listed as a **known deviation** in the skill itself, for example the onion
  "Known deviations" list, **unless the diff deepens it** (adds a new query or import to that
  file).
- Style that the formatter or the typecheck already enforce.
- Guesses about code you did not read.
