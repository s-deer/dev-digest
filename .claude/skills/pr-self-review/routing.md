# Routing: which skill reviews which files

This file is the single source of truth for routing. `scripts/route.mjs` parses the **Routes**
table below, so keep the column order and put every glob or regex in backticks.

How a file is matched:
- A row matches a file when the path matches **any** glob in *Include*, matches **no** glob in
  *Exclude*, and, if *Content* is set, the file content matches that regex.
- A skill can have several rows. The skill gets the union of files from all its rows.
- Globs support `**`, `*`, `?` and `{a,b}`, and are matched against repo-relative paths.

Files that no reviewer sees (they are still in the fingerprint and in `diff-rules.mjs`):
lockfiles, `server/src/db/migrations/**` (generated; the reviewer looks at `schema.ts` instead),
and deleted files.

## Routes

| Skill | Include | Exclude | Content |
|---|---|---|---|
| react-architecture | `client/src/**/*.{ts,tsx}` | `client/**/*.test.{ts,tsx}` `client/src/test/**` | |
| react-best-practices | `client/src/**/*.tsx` `client/src/**/use*.ts` | `client/**/*.test.{ts,tsx}` `client/src/test/**` | |
| next-best-practices | `client/src/app/**/{page,layout,template,loading,error,global-error,not-found,default,route}.{ts,tsx}` `client/next.config.mjs` `client/src/middleware.ts` | `client/**/*.test.{ts,tsx}` | |
| next-best-practices | `client/src/**/*.{ts,tsx}` | `client/**/*.test.{ts,tsx}` | `^\s*['"]use (client\|server)['"]` |
| react-testing-library | `client/**/*.test.{ts,tsx}` `client/src/test/**` `client/vitest.config.ts` | | |
| onion-architecture | `server/src/modules/**/*.ts` `server/src/adapters/**/*.ts` `server/src/platform/container.ts` | `**/*.test.ts` | |
| fastify-best-practices | `server/src/modules/**/routes.ts` `server/src/modules/**/routes/**/*.ts` `server/src/app.ts` `server/src/server.ts` `server/src/platform/**/*.ts` | `**/*.test.ts` | |
| drizzle-orm-patterns | `server/src/db/**/*.ts` `server/src/modules/**/repository.ts` `server/src/modules/**/repository/**/*.ts` `server/drizzle.config.ts` | `server/src/db/migrations/**` `**/*.test.ts` | |
| postgresql-table-design | `server/src/db/schema.ts` `server/src/db/schema/**/*.ts` | | |
| zod | `server/src/vendor/shared/**/*.ts` `client/src/vendor/shared/**/*.ts` `reviewer-core/src/**/*.ts` | | |
| zod | `server/src/**/*.ts` `client/src/**/*.{ts,tsx}` | `**/*.test.{ts,tsx}` | `\bz\.(object\|enum\|union\|discriminatedUnion\|array\|string)\(` |
| security | `server/src/modules/**/routes.ts` `server/src/modules/**/routes/**/*.ts` `server/src/platform/**/*.ts` `server/src/adapters/**/*.ts` `server/src/app.ts` | `**/*.test.ts` | |
| security | `server/src/**/*.ts` `client/src/**/*.{ts,tsx}` `reviewer-core/src/**/*.ts` `scripts/**` | `**/*.test.{ts,tsx}` | `dangerouslySetInnerHTML\|innerHTML\s*=\|child_process\|\bexeca\b\|\beval\(\|new Function\(\|secrets\.json\|process\.env\.\|simple-git` |
| typescript-expert | `reviewer-core/src/**/*.ts` `**/tsconfig*.json` `**/*.d.ts` | `**/next-env.d.ts` | |

## Not reviewers

These skills are never routed. `route.mjs` does not warn about them.

- `engineering-insights`: writes lessons down, it does not review code.
- `mermaid-diagram`: draws diagrams, it does not review code.
- `pr-self-review`: this skill.

Every other skill in `.claude/skills/` that has no row above is reported as an
**unrouted skill**. When you add a skill, either add a row here or list it under *Not reviewers*.
