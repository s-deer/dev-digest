import { describe, expect, it } from "vitest";
import { acceptedCandidates, candidatesForFilter } from "./helpers";
import type { ConventionsState } from "@devdigest/shared";

const state = {
  last_scan: null,
  candidates: [
    { id: "1", repo_id: "repo", scan_id: null, category: "api", rule: "A", rationale: null, evidence_path: "a.ts", evidence_line: 1, evidence_snippet: "const a = 1", confidence: 0.9, status: "accepted", created_at: "", updated_at: "" },
    { id: "2", repo_id: "repo", scan_id: null, category: "testing", rule: "B", rationale: null, evidence_path: "b.ts", evidence_line: 2, evidence_snippet: "const b = 1", confidence: 0.8, status: "pending", created_at: "", updated_at: "" },
  ],
  counts: { pending: 1, accepted: 1, rejected: 0 },
} as ConventionsState;

describe("conventions helpers", () => {
  it("filters candidates and derives accepted selection", () => {
    expect(candidatesForFilter(state, "all")).toHaveLength(2);
    expect(candidatesForFilter(state, "pending").map((candidate) => candidate.id)).toEqual(["2"]);
    expect(acceptedCandidates(state).map((candidate) => candidate.id)).toEqual(["1"]);
  });
});
