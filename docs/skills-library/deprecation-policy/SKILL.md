---
name: deprecation-policy
description: Require removals and renames of routes or fields to go through a deprecation step (Deprecation/Sunset headers, docs note, kept alias) before deletion.
type: convention
---
# Deprecation policy

## Rule
A route or field may be removed only after it was deprecated in an earlier
release. When the diff removes or renames one, require in the same or an
earlier change:

- the old route still answers, with `Deprecation: true` and a `Sunset` date
  header, or the old field is still returned as an alias;
- a changelog/docs entry naming the replacement and the removal date.

Flag as **CRITICAL** a removal with no prior deprecation. Flag as **WARNING** a
deprecation without a replacement or sunset date.

## Good
```ts
app.get('/pulls/:id', async (req, reply) => {
  reply.header('Deprecation', 'true').header('Sunset', 'Wed, 31 Dec 2026 23:59:59 GMT');
  return service.get(req.params.id); // kept until the sunset date
});
```

## Bad
```diff
- app.get('/pulls/:id', ...)   // deleted in the same PR that adds the replacement
```
