# Examples from this codebase

## ✅ Reference module: `modules/repos/`

```
repos/
├── routes.ts      ring 4  "Transport layer only: parses requests, maps status codes"
├── service.ts     ring 3  "No HTTP and no raw SQL live here"
├── repository.ts  ring 4  "The ONLY place that touches the `repos` table"
├── helpers.ts     ring 1  parseRepoUrl, withGitHubToken, toRepoDto
└── constants.ts   ring 1  job kinds, clone depth, secret names
```

`RepoService.runCloneJob` talks to `container.git` (the `GitClient` port), `container.secrets`,
and `container.jobs`. It never touches `simple-git` or SQL. Copy this shape for new modules. The
one thing to do better in new code is to pass narrow deps instead of `Container` (see below).

## ❌ → ✅ SQL in a route handler (`modules/settings/routes.ts`)

Before (current code):
```ts
app.get('/settings', async (req) => {
  const { workspaceId } = await getContext(container, req);
  const rows = await container.db
    .select().from(t.settings).where(eq(t.settings.workspaceId, workspaceId));
  return rowsToSettings(rows);
});
```

After:
```ts
// settings/repository.ts  (ring 4)
export class SettingsRepository {
  constructor(private db: Db) {}
  list(workspaceId: string) {
    return this.db.select().from(t.settings).where(eq(t.settings.workspaceId, workspaceId));
  }
}

// settings/service.ts  (ring 3)
export class SettingsService {
  constructor(private deps: { settings: SettingsRepository }) {}
  async get(workspaceId: string): Promise<Settings> {
    return rowsToSettings(await this.deps.settings.list(workspaceId));
  }
}

// settings/routes.ts  (ring 4)
const service = new SettingsService({ settings: new SettingsRepository(app.container.db) });
app.get('/settings', async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.get(workspaceId);
});
```
Why: the tenancy filter now lives in one method, and `SettingsService` can be tested with an
in-memory `{ list: async () => [...] }`.

## ❌ → ✅ Service takes the whole container

Before:
```ts
export class RenameRepo {
  constructor(private container: Container) {}
  async run(ws: string, id: string, name: string) {
    const repo = new RepoRepository(this.container.db);   // builds its own infra
    ...
    await this.container.jobs.enqueue(ws, CLONE_JOB_KIND, {...});
  }
}
```

After:
```ts
export interface RenameRepoDeps {
  repos: Pick<RepoRepository, 'getById' | 'findByFullName' | 'rename'>;
  jobs: Pick<JobRunner, 'enqueue'>;
}
export class RenameRepo {
  constructor(private deps: RenameRepoDeps) {}
  ...
}
```
Why: the constructor now documents the use case's real dependencies, and a test passes two
small fakes instead of building a full `Container`.

## ❌ → ✅ SDK inside a service

Before:
```ts
import { Octokit } from 'octokit';
const gh = new Octokit({ auth: await container.secrets.get('GITHUB_TOKEN') });
const { data } = await gh.rest.pulls.list({ owner, repo: name, state: 'open' });
```

After:
```ts
const github = await container.github();      // GitHubClient port, resolved in the composition root
const pulls = await github.listPullRequests({ owner, name });
```
If the port lacks the method you need, add it to `GitHubClient` in `vendor/shared/adapters.ts`,
implement it in `adapters/github/octokit.ts`, and add it to `MockGitHubClient`.

## ❌ → ✅ Transaction leaking into the service

Before:
```ts
await this.container.db.transaction(async (tx) => {
  await tx.update(t.repos).set({ name }).where(eq(t.repos.id, id));
  await tx.insert(t.pullRequests)...
});
```

After: the service calls `repos.renameAndReset(workspaceId, id, name)` or
`repos.withTransaction(async ({ repos, pulls }) => …)`. The `tx` never leaves the repository
(see `drizzle.md`).

## ❌ → ✅ Route maps "not found" itself

Before:
```ts
const repo = await service.get(ws, id);
if (!repo) return reply.status(404).send({ message: 'nope' });
```

After: `service.get` throws `new NotFoundError('Repo not found')`, and the route just returns the
value. The shared error handler produces `{ error: { code: 'not_found', … } }`, the same shape
as every other endpoint.

## Reviewing a diff: sample output

> **ring 3 → ring 4 dependency** `server/src/modules/foo/service.ts:4` imports `drizzle-orm`.
> Move the `select … where workspace_id = …` query (`service.ts:41-48`) into
> `FooRepository.listActive(workspaceId)` and call it from the service.
>
> **service locator** `FooService` takes `Container` but only uses `db` and `jobs`. Pass
> `{ foos: FooRepository, jobs }` instead so `foo.test.ts` can stay hermetic.
