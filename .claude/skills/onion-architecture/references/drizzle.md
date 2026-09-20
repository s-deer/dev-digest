# Drizzle: repositories are a driven adapter (ring 4)

The repository implements the persistence side of a use case. It is the only module file that
imports `drizzle-orm` or `db/schema`. Everything Drizzle-shaped (query builders, `tx`, `sql`
fragments, `$inferSelect` rows, Postgres error codes) stays behind its methods.

## Shape

```ts
export class RepoRepository {
  constructor(private db: Db) {}

  async findByFullName(workspaceId: string, fullName: string): Promise<RepoRow | undefined> {
    const [row] = await this.db.select().from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, fullName)));
    return row;
  }
}
```
(`server/src/modules/repos/repository.ts`.)

- **Name methods in domain language**: `findByFullName`, `updateClonePath`, `latestReviewFor`,
  not `selectWhere` / `runQuery`. The method is the port. Its name is what the service reads.
- **Scope by `workspaceId` in every query.** Tenancy is enforced here, once. A method that
  deliberately skips it (like `workspaceIdFor`, called from a trusted job) says so in a comment.
- **Return values, not builders.** Never return a query builder or a `sql` fragment; the service
  would then be composing SQL. Return rows mapped to a domain/DTO type, `undefined`/`null`, or a
  boolean for affected-row checks.
- **Row types stay close.** `$inferSelect` / `db/rows.ts` types are fine inside the repository and
  in the `toXDto` mapper next to it. For new code, a service method signature should speak in
  `@devdigest/shared` types or a module domain type. If the row *is* the domain shape today,
  re-export it under a domain name (`export type Repo = RepoRow`) so there is one seam to
  change later.
- **Big modules split repositories by aggregate**: `reviews/repository/{review,pull,run}.repo.ts`
  behind a `ReviewRepository` facade. Shared cross-module repositories are built in the
  container (`container.agentsRepo`, `container.reviewRepo`).

## Transactions

A transaction is a use-case decision ("these writes succeed or fail together"), but `tx` is a
Drizzle object. Keep the decision in ring 3 and the object in ring 4:

```ts
// repository.ts — the tx never leaves this file (illustrative: `auditLog` is a hypothetical table)
async renameWithAudit(workspaceId: string, id: string, name: string, userId: string) {
  return this.db.transaction(async (tx) => {
    const [row] = await tx.update(t.repos).set({ name })
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id))).returning();
    if (!row) return undefined;
    await tx.insert(t.auditLog).values({ workspaceId, actorId: userId, action: 'repo.rename', targetId: id });
    return row;
  });
}
```

When a use case spans several repositories, give the repository layer a unit-of-work callback
instead of passing `tx` through the service:

```ts
// repository side
withTransaction<T>(fn: (repos: { repos: RepoRepository; audit: AuditRepository /* illustrative */ }) => Promise<T>) {
  return this.db.transaction((tx) => fn({ repos: new RepoRepository(tx), audit: new AuditRepository(tx) }));
}
```

The service sees repositories. It never sees `tx`. A Drizzle `tx` has the same query API as
`db` but a different TypeScript type, so a repository that must work inside a transaction types
its constructor with an executor union:

```ts
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Executor = Db | Tx;
export class RepoRepository { constructor(private db: Executor) {} }
```

Then the same class works inside and outside a transaction.

## Driver errors → domain errors

Translate Postgres errors at this boundary so inner rings never inspect `err.code === '23505'`:

```ts
try {
  return await this.db.insert(t.repos).values(v).returning();
} catch (err) {
  if ((err as { code?: string }).code === '23505') {
    throw new AppError('repo_exists', 'A repo with this name already exists', 409);
  }
  throw err;
}
```

Better still, avoid the exception: check first in the service (`findByFullName`) or use
`onConflictDoNothing().returning()` and return `undefined`, then let the service decide.

## Schema and migrations

`src/db/schema.ts` + `src/db/schema/*.ts` are infrastructure. Change the schema there, then
`pnpm db:generate` and `pnpm db:migrate`. Never hand-edit `src/db/migrations/**`. A schema
change doesn't have to change the API: the repository's mapping absorbs it. That is the payoff
of not leaking rows. For schema design itself use the `drizzle-orm-patterns` and
`postgresql-table-design` skills.
