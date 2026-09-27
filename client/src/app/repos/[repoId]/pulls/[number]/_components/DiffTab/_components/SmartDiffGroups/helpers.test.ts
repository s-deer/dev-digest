import { describe, it, expect } from "vitest";
import type { PrFile, SmartDiffGroup } from "@devdigest/shared";
import { buildGroupedFiles } from "./helpers";

function file(path: string): PrFile {
  return { path, additions: 1, deletions: 0, patch: null };
}

describe("buildGroupedFiles", () => {
  it("maps each group's paths back to the matching PrFile, keeping GitHub order and carrying finding_lines", () => {
    const a = file("a.ts");
    const b = file("b.ts");
    const groups: SmartDiffGroup[] = [
      { role: "core", files: [{ path: "a.ts", additions: 1, deletions: 0, finding_lines: [1, 4] }] },
      { role: "tests", files: [{ path: "b.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    ];

    expect(buildGroupedFiles(groups, [a, b])).toEqual([
      { role: "core", entries: [{ file: a, findingLines: [1, 4] }] },
      { role: "tests", entries: [{ file: b, findingLines: [] }] },
    ]);
  });

  it("appends a PrFile the response didn't classify to a core group, creating one at the front if none exists", () => {
    const known = file("known.ts");
    const missing = file("missing.ts");
    const groups: SmartDiffGroup[] = [
      { role: "tests", files: [{ path: "known.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    ];

    expect(buildGroupedFiles(groups, [known, missing])).toEqual([
      { role: "core", entries: [{ file: missing, findingLines: [] }] },
      { role: "tests", entries: [{ file: known, findingLines: [] }] },
    ]);
  });

  it("appends a missing PrFile to an existing core group instead of creating a second one", () => {
    const coreFile = file("core.ts");
    const missing = file("missing.ts");
    const groups: SmartDiffGroup[] = [
      { role: "core", files: [{ path: "core.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    ];

    expect(buildGroupedFiles(groups, [coreFile, missing])).toEqual([
      {
        role: "core",
        entries: [
          { file: coreFile, findingLines: [] },
          { file: missing, findingLines: [] },
        ],
      },
    ]);
  });
});
