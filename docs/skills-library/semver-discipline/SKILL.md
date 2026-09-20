---
name: semver-discipline
description: Require a major version bump, or a new versioned route, for every breaking contract change; flag breaking changes shipped as minor or patch.
type: convention
---
# Semver discipline

## Rule
When the diff contains a breaking contract change (see `breaking-change`), it
must also do one of:

- bump the package/API major version (`package.json`, `API_VERSION`, OpenAPI
  `info.version`), or
- ship the new shape under a new versioned path (`/v2/...`) while keeping the
  old one.

Flag as **CRITICAL** a breaking change with only a minor/patch bump or no bump.
Flag as **SUGGESTION** a major bump with no breaking change.

## Good
```diff
- "version": "1.4.2"
+ "version": "2.0.0"
+ app.get('/v2/pulls/:id', ...)   // v1 kept until the deprecation window ends
```

## Bad
```diff
- "version": "1.4.2"
+ "version": "1.5.0"
- title: z.string(),
+ name: z.string(),
```
