---
name: over-mocking
description: Flag tests that mock the unit under test or its pure collaborators, so the assertion only proves the mock was called.
type: rubric
---
# Over-mocking

## Rule
Mock only the outside world: network, clock, filesystem, database, LLM
providers. Flag as **WARNING**:

- a mock of the function or module the test claims to test;
- a mock of a pure helper whose real behaviour is cheap and deterministic;
- a test whose only assertion is `toHaveBeenCalled` on a mock, with no
  assertion on the returned value or resulting state.

Say which mock hides which behaviour.

## Good
```ts
const github = new MockGitHubClient({ pulls: [pr] }); // external I/O only
const result = await syncPulls(db, github);
expect(result.imported).toBe(1);
expect(await db.select().from(pulls)).toHaveLength(1);
```

## Bad
```ts
vi.mock('./syncPulls', () => ({ syncPulls: vi.fn().mockResolvedValue({ imported: 1 }) }));
expect(await syncPulls(db, github)).toEqual({ imported: 1 }); // tests the mock
```
