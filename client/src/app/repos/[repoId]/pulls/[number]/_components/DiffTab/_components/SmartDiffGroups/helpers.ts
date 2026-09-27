/* Pure helper for SmartDiffGroups: map a SmartDiff response's groups (path +
   finding_lines) back onto the PrFile objects that carry the real patch, in
   GitHub order within each group. A PrFile the response didn't classify (a
   defensive gap — e.g. a race with a newly pushed commit) is appended to the
   core group instead of silently dropped, creating one at the front if the
   response had none. */
import type { PrFile, SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";

export interface SmartDiffFileEntry {
  file: PrFile;
  findingLines: number[];
}

export interface SmartDiffFileGroup {
  role: SmartDiffRole;
  entries: SmartDiffFileEntry[];
}

export function buildGroupedFiles(groups: SmartDiffGroup[], files: PrFile[]): SmartDiffFileGroup[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const seen = new Set<string>();
  const result: SmartDiffFileGroup[] = [];

  for (const g of groups) {
    const entries: SmartDiffFileEntry[] = [];
    for (const gf of g.files) {
      const file = byPath.get(gf.path);
      if (!file) continue; // classified server-side but not in this PrFile list — nothing to render
      seen.add(gf.path);
      entries.push({ file, findingLines: gf.finding_lines });
    }
    if (entries.length > 0) result.push({ role: g.role, entries });
  }

  const missing = files.filter((f) => !seen.has(f.path));
  if (missing.length > 0) {
    const missingEntries = missing.map((file) => ({ file, findingLines: [] as number[] }));
    const core = result.find((g) => g.role === "core");
    if (core) core.entries.push(...missingEntries);
    else result.unshift({ role: "core", entries: missingEntries });
  }

  return result;
}
