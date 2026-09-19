# react-architecture — examples

Source numbers refer to [README.md](README.md).

## 1. Placement: adding a feature page

Task: "Compare runs" page with a table, a two-run diff, a severity-delta helper, and a max-runs constant.

### ❌ Technical folders at app level

```
src/
  components/CompareTable.tsx       ← used by one route, but sits in shared
  components/RunDiff.tsx
  utils/severityDelta.ts            ← domain logic in "generic" utils
  constants/index.ts                ← MAX_COMPARE_RUNS among 40 unrelated constants
  app/repos/[repoId]/compare/page.tsx   ← 300 lines: fetch + logic + JSX
```

Why it's worse:
- Shared folders fill up with single-use code, so nobody can tell what is safe to change.
- Deleting the feature means hunting through 4 folders. [#12, #13]

### ✅ Colocated with the route

```
src/app/repos/[repoId]/compare/
  page.tsx                          ← reads params, renders <CompareRunsView/>
  _components/
    CompareRunsView/
      CompareRunsView.tsx           ← uses useCompareRuns(); lays out children
      CompareRunsView.test.tsx
      constants.ts                  ← MAX_COMPARE_RUNS = 4
      helpers.ts                    ← computeSeverityDelta(a, b): pure, tested
      _components/
        CompareTable/CompareTable.tsx
        RunDiff/RunDiff.tsx
src/lib/hooks/runs.ts               ← + useCompareRuns(): data access stays in the data layer
```

When a second route needs `computeSeverityDelta`, move it to shared `lib/` (e.g. `src/lib/severity.ts`). Not `utils/`, because it is domain logic. [#21]

## 2. Refactor: splitting a god component

### ❌ Before

```tsx
"use client";
export function RunsPanel({ repoId }: { repoId: string }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [filtered, setFiltered] = useState<Run[]>([]);
  const [onlyFailed, setOnlyFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/repos/${repoId}/runs`).then(r => r.json()).then(setRuns);   // fetch in component
  }, [repoId]);

  useEffect(() => {                                                        // derived state via effect
    setFiltered(onlyFailed ? runs.filter(r => r.status === "failed") : runs);
  }, [runs, onlyFailed]);

  return (
    <div>
      {/* header */}
      <label><input type="checkbox" checked={onlyFailed} onChange={e => setOnlyFailed(e.target.checked)} /> Only failed</label>
      {/* list */}
      {filtered.map(r => (
        <div key={r.id} style={{ color: r.findings.filter(f => f.severity === "critical").length > 0 ? "red" : undefined }}>
          {r.agent_name} — {new Date(r.created_at).toLocaleString()}
        </div>
      ))}
    </div>
  );
}
```

### ✅ After

```
RunsPanel/
  RunsPanel.tsx        ← view: composes, holds one piece of UI state
  helpers.ts           ← filterRuns, hasCritical, formatRunTime (pure)
  styles.ts
  _components/RunRow/RunRow.tsx
lib/hooks/runs.ts      ← useRuns(repoId) over api.ts
```

```ts
// helpers.ts: domain rules, no React [#17]
export const hasCritical = (run: Run) => run.findings.some(f => f.severity === "critical");
export const filterRuns = (runs: Run[], onlyFailed: boolean) =>
  onlyFailed ? runs.filter(r => r.status === "failed") : runs;
```

```tsx
// RunsPanel.tsx
export function RunsPanel({ repoId }: { repoId: string }) {
  const { data: runs = [] } = useRuns(repoId);          // server state stays in the query cache [#24]
  const [onlyFailed, setOnlyFailed] = useState(false);  // UI state, lowest owner [#10]
  const visible = filterRuns(runs, onlyFailed);          // derived during render [#9]

  return (
    <div>
      <OnlyFailedToggle checked={onlyFailed} onChange={setOnlyFailed} />
      {visible.map(run => <RunRow key={run.id} run={run} />)}
    </div>
  );
}
```

## 3. Constants

```ts
// ❌ inside the component: re-created every render, hidden in the body
function Pager() { const PAGE_SIZE = 20; ... }

// ✅ module scope in the same file (single use)
const PAGE_SIZE = 20;

// ✅ feature constants.ts (used across the feature)
export const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

// ✅ app config: the one module that reads env
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";
```

## 4. Next.js server code

```
app/agents/[id]/
  page.tsx                   ← Server Component: const agent = await getAgent(id)
  _lib/actions.ts            ← "use server"; archiveAgentAction(formData)
  _components/
    ArchiveButton/ArchiveButton.tsx   ← "use client" leaf, calls the action
src/server/
  agents.ts                  ← import 'server-only'; getAgent / archiveAgent (authz + DTO)
  db.ts                      ← import 'server-only'
```

```ts
// _lib/actions.ts: thin [#4]
"use server";
export async function archiveAgentAction(input: unknown) {
  const { id } = ArchiveInput.parse(input);   // validate
  await archiveAgent(id);                     // DAL checks authorization
  revalidatePath(`/agents/${id}`);
}
```

## 5. Cross-feature import

```ts
// ❌ features/runs/RunRow.tsx
import { AgentAvatar } from "@/features/agents/components/AgentAvatar";   // runs now depends on agents' internals

// ✅ either promote it to shared…
import { AgentAvatar } from "@/components/agent-avatar";
// …or let the route compose both features and pass the avatar down as a prop/slot [#11]
<RunRow run={run} avatar={<AgentAvatar agent={agent} />} />
```
