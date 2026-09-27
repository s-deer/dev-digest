import { describe, it, expect } from "vitest";
import type { ReviewRecord, FindingRecord, PrFile } from "@devdigest/shared";
import { latestReviewFindings, findingsByPath, hasReview, diffTotals } from "./helpers";

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "a.ts",
    start_line: 1,
    end_line: 1,
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

function review(o: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "r1",
    pr_id: "p1",
    agent_id: null,
    run_id: null,
    agent_name: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    grounding: null,
    tokens_in: null,
    tokens_out: null,
    cost_usd: null,
    created_at: "2026-01-01T00:00:00.000Z",
    findings: [],
    ...o,
  };
}

describe("latestReviewFindings", () => {
  it("picks the newest kind='review' review by created_at (not array order) and drops dismissed findings", () => {
    const kept = finding({ id: "kept" });
    const dismissedFinding = finding({ id: "gone", dismissed_at: "2026-01-02T00:00:00.000Z" });
    const older = review({
      id: "old",
      created_at: "2026-01-01T00:00:00.000Z",
      findings: [finding({ id: "stale" })],
    });
    const summary = review({
      id: "sum",
      kind: "summary",
      created_at: "2026-01-03T00:00:00.000Z",
      findings: [finding({ id: "ignored" })],
    });
    const newest = review({
      id: "new",
      created_at: "2026-01-02T00:00:00.000Z",
      findings: [kept, dismissedFinding],
    });

    // Deliberately out of chronological order, to prove created_at — not
    // array position — decides which review is "latest".
    const result = latestReviewFindings([summary, newest, older]);

    expect(result).toEqual([kept]);
  });

  it("returns [] when there is no kind='review' review", () => {
    expect(latestReviewFindings([review({ kind: "summary" })])).toEqual([]);
    expect(latestReviewFindings([])).toEqual([]);
  });

  it("breaks a created_at tie by the higher id (matches the server's desc(createdAt), desc(id))", () => {
    const olderId = review({
      id: "aaaaaaaa-0000-0000-0000-000000000000",
      created_at: "2026-01-02T00:00:00.000Z",
      findings: [finding({ id: "loses-tie" })],
    });
    const newerId = review({
      id: "bbbbbbbb-0000-0000-0000-000000000000",
      created_at: "2026-01-02T00:00:00.000Z",
      findings: [finding({ id: "wins-tie" })],
    });

    const result = latestReviewFindings([olderId, newerId]);

    expect(result.map((f) => f.id)).toEqual(["wins-tie"]);
  });
});

describe("findingsByPath", () => {
  it("groups findings by file path, preserving order within a file", () => {
    const a1 = finding({ id: "a1", file: "a.ts" });
    const a2 = finding({ id: "a2", file: "a.ts" });
    const b1 = finding({ id: "b1", file: "b.ts" });

    const map = findingsByPath([a1, a2, b1]);

    expect(map.get("a.ts")).toEqual([a1, a2]);
    expect(map.get("b.ts")).toEqual([b1]);
    expect(map.size).toBe(2);
  });
});

describe("hasReview", () => {
  it("is true when at least one kind='review' review exists, even with no findings", () => {
    expect(hasReview([review({ kind: "review", findings: [] })])).toBe(true);
  });

  it("is false with no reviews, or only non-review kinds", () => {
    expect(hasReview([])).toBe(false);
    expect(hasReview([review({ kind: "summary" })])).toBe(false);
  });
});

describe("diffTotals", () => {
  function file(o: Partial<PrFile>): PrFile {
    return { path: "a.ts", additions: 0, deletions: 0, patch: null, ...o };
  }

  it("sums additions and deletions across files, treating missing values as 0", () => {
    const files = [file({ additions: 3, deletions: 1 }), file({ additions: 2 }), file({})];

    expect(diffTotals(files)).toEqual({ add: 5, del: 1 });
  });

  it("returns zeros for an empty file list", () => {
    expect(diffTotals([])).toEqual({ add: 0, del: 0 });
  });
});
