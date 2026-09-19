# Enforcing boundaries

Architecture rules that only live in reviewers' heads decay. Encode the dependency direction in lint so a bad import fails the moment it is written. [#11, #33, #34]

Propose these only when the user asks about enforcement, or when a review keeps finding the same boundary violation. Adding lint config is a separate change.

## Option A — `import/no-restricted-paths` (eslint-plugin-import)

The minimal setup. Bulletproof React uses it. [#11]

```js
// eslint.config.mjs (flat config)
import importPlugin from "eslint-plugin-import";

export default [
  {
    plugins: { import: importPlugin },
    rules: {
      "import/no-restricted-paths": ["error", {
        zones: [
          // features never import from each other
          { target: "./src/features/agents", from: "./src/features", except: ["./agents"] },
          { target: "./src/features/runs",   from: "./src/features", except: ["./runs"] },
          // shared never imports features or app
          { target: ["./src/components", "./src/hooks", "./src/lib", "./src/utils"],
            from: ["./src/features", "./src/app"] },
          // features never import app
          { target: "./src/features", from: "./src/app" },
        ],
      }],
    },
  },
];
```

For the split-by-route layout (route-private `_components`), add a zone per top-level route. For example, `src/app/agents` cannot import from `src/app/repos/**/_components`.

## Option B — `eslint-plugin-boundaries`

Declarative element types and allow-lists. Better once there are more than a handful of zones. [#33]

```js
import boundaries from "eslint-plugin-boundaries";

export default [
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "app",     pattern: "src/app/*" },
        { type: "feature", pattern: "src/features/*", capture: ["name"] },
        { type: "shared",  pattern: "src/(components|hooks|lib|utils|config|types)/*" },
      ],
    },
    rules: {
      "boundaries/element-types": ["error", {
        default: "disallow",
        rules: [
          { from: "app",     allow: ["feature", "shared"] },
          { from: "feature", allow: ["shared", ["feature", { name: "${from.name}" }]] },
          { from: "shared",  allow: ["shared"] },
        ],
      }],
    },
  },
];
```

## Option C — dependency-cruiser (CI + graph)

Runs in CI rather than the editor. It also finds cycles and orphans and can render the dependency graph, which is useful for an architecture review. [#34]

```js
// .dependency-cruiser.cjs
module.exports = {
  forbidden: [
    { name: "no-cross-feature", severity: "error",
      from: { path: "^src/features/([^/]+)/" },
      to:   { path: "^src/features/([^/]+)/", pathNot: "^src/features/$1/" } },
    { name: "shared-not-to-features", severity: "error",
      from: { path: "^src/(components|hooks|lib|utils)/" },
      to:   { path: "^src/(features|app)/" } },
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
  ],
};
```

## Also worth enforcing

- `import 'server-only'` in data-access modules. It enforces itself at build time. [#5]
- `no-restricted-imports` on patterns like `fetch` wrappers or DB clients inside `components/**`.
- Ban aggregating barrels: `no-restricted-syntax` on `ExportAllDeclaration` outside an allow-list. [#27]
