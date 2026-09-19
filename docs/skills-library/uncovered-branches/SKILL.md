---
name: uncovered-branches
description: Flag changed production branches (else, early return, thrown error) that no test in the diff executes and asserts on.
type: rubric
---
# Uncovered branches

## Rule
For every production function the diff adds or changes, list its branches:
each `if`/`else`, early `return`, `switch` case, thrown error, and `catch`.
Flag every branch that no test in the diff executes AND asserts on.

- A test that only exercises the happy path of a function with an error or
  fallback branch is a finding: **WARNING**, or **CRITICAL** when the untested
  branch guards money, auth, or data deletion.
- Name the branch (file:line of the condition) and the input that would reach it.
- A branch is covered only if a test asserts on its observable result, not
  merely if the line runs.

## Good
```ts
export function discount(total: number) {
  if (total <= 0) throw new RangeError('total must be positive');
  return total >= 100 ? total * 0.9 : total;
}
it('rejects a non-positive total', () => expect(() => discount(0)).toThrow(RangeError));
it('discounts from 100', () => expect(discount(100)).toBe(90));
it('keeps smaller totals', () => expect(discount(99)).toBe(99));
```

## Bad
```ts
it('applies the discount', () => expect(discount(200)).toBe(180));
// the throw branch and the "< 100" branch are never tested
```
