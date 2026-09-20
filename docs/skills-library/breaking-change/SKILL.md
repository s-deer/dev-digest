---
name: breaking-change
description: Flag any change to a route's path, method, required request fields, response fields, types, nullability, or status codes that existing callers rely on.
type: convention
---
# Breaking change

## Rule
Compare every changed route and shared contract with its previous version.
Flag as **CRITICAL** when an existing caller would break:

- the path or HTTP method changed, or a route was removed;
- a request field became required, was renamed, or changed type;
- a response field was removed, renamed, changed type, or became nullable;
- a success or error status code changed.

A change is not breaking when the old shape keeps working (new optional request
field, new response field). State the old and new shape and who calls it.

## Good
```ts
// v1 stays; the new behaviour is additive
app.get('/pulls/:id', { schema: { response: { 200: Pull } } }, ...);          // unchanged
const Pull = z.object({ id: z.string(), title: z.string(), labels: z.array(z.string()).default([]) });
```

## Bad
```ts
- app.get('/pulls/:id', ...)
+ app.get('/pull-requests/:pullId', ...)   // every client URL breaks
- title: z.string(),
+ name: z.string(),                          // renamed response field
```
