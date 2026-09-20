---
name: flaky-tests
description: Flag tests that depend on wall-clock time, real timers, sleeps, random values, test order, or live network.
type: rubric
---
# Flaky tests

## Rule
Flag as **WARNING** any test in the diff that can pass or fail without a code
change:

- `setTimeout`/`sleep` waits instead of fake timers or awaiting the real signal;
- `Date.now()`/`new Date()` without a fixed clock;
- `Math.random()` or unseeded generators;
- shared mutable state between tests, or reliance on test order;
- real network, real ports, or real third-party services.

Name the source of nondeterminism and the deterministic replacement.

## Good
```ts
vi.useFakeTimers();
vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
scheduleRetry(job);
await vi.advanceTimersByTimeAsync(30_000);
expect(job.attempts).toBe(2);
```

## Bad
```ts
scheduleRetry(job);
await new Promise((r) => setTimeout(r, 31_000)); // slow and timing-dependent
expect(job.attempts).toBe(2);
```
