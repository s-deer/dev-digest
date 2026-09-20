---
name: response-schema
description: Require every changed route to declare a Zod response schema from the shared contracts, and flag handlers that return fields outside it.
type: convention
---
# Response schema

## Rule
Every route the diff adds or changes must declare `schema.response` for each
success status, using a schema from `@devdigest/shared` (never an inline
object that duplicates it). Flag as **WARNING**:

- a changed route without `response` schemas;
- a handler returning a field the schema does not declare (it is silently
  stripped, so the client never sees it);
- an inline response schema that redeclares a shared contract.

Flag as **CRITICAL** when the schema and handler disagree on a required field.

## Good
```ts
app.get('/skills/:id', { schema: { params: IdParams, response: { 200: Skill } } }, async (req) => service.get(req.params.id));
```

## Bad
```ts
app.get('/skills/:id', async (req) => ({ ...skill, secretNote: row.note })); // no schema, leaks a field
```
