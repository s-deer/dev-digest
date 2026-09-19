---
name: boundary-cases
description: Flag tests that skip the boundary inputs of changed code: empty, zero, one, max/limit, and just past the limit.
type: rubric
---
# Boundary cases

## Rule
When the diff changes code that takes a collection, a number, a string, or a
limit, require tests at its edges:

- empty (`[]`, `''`, `{}`), `0`, `1`, `null`/`undefined` where the type allows it;
- the exact limit (e.g. `pageSize`), the limit minus one, and the limit plus one;
- the first and last element for index arithmetic.

Flag a missing edge as **WARNING** and name the input the tests should add.
Do not flag edges the function's type makes impossible.

## Good
```ts
it.each([[[], 0], [[5], 5], [[1, 2, 3], 6]])('sums %j', (xs, want) => expect(sum(xs)).toBe(want));
it('caps the page at the limit', () => expect(paginate(items, 50).length).toBe(50));
it('accepts exactly the limit', () => expect(() => validate({ size: MAX })).not.toThrow());
it('rejects one past the limit', () => expect(() => validate({ size: MAX + 1 })).toThrow());
```

## Bad
```ts
it('sums numbers', () => expect(sum([1, 2, 3])).toBe(6)); // empty input never tried
```
