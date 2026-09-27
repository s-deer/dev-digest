import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import type { Line } from "./helpers";
import { findingsForLine, partitionFindings, topSeverity } from "./findings";

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "a.ts",
    start_line: 5,
    end_line: 5,
    rationale: "r",
    suggestion: null,
    confidence: 0.5,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

describe("findingsForLine", () => {
  it("matches a finding to the line whose RIGHT key equals RIGHT:start_line, and no other line", () => {
    const line5: Line = { kind: "add", text: "x", newNo: 5 };
    const line6: Line = { kind: "ctx", text: "y", oldNo: 6, newNo: 6 };
    const f = finding({ start_line: 5 });

    expect(findingsForLine(line5, [f])).toEqual([f]);
    expect(findingsForLine(line6, [f])).toEqual([]);
  });

  it("never matches a del-only line (it has no RIGHT key)", () => {
    const delLine: Line = { kind: "del", text: "z", oldNo: 5 };
    expect(findingsForLine(delLine, [finding({ start_line: 5 })])).toEqual([]);
  });
});

describe("partitionFindings", () => {
  it("splits findings into ones anchored to a rendered line and unanchored ones", () => {
    const anchored = finding({ id: "a", start_line: 5 });
    const unanchored = finding({ id: "b", start_line: 99 });

    const { matched, outside } = partitionFindings([anchored, unanchored], new Set(["RIGHT:5"]));

    expect(matched).toEqual([anchored]);
    expect(outside).toEqual([unanchored]);
  });
});

describe("topSeverity", () => {
  it("ranks CRITICAL over WARNING over SUGGESTION, and returns null for an empty list", () => {
    expect(topSeverity([])).toBeNull();
    expect(
      topSeverity([
        finding({ severity: "SUGGESTION" }),
        finding({ severity: "CRITICAL" }),
        finding({ severity: "WARNING" }),
      ]),
    ).toBe("CRITICAL");
  });
});
