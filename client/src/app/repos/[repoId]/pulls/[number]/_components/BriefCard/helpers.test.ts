import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { BriefRiskRecord, FindingRecord, ReviewRecord } from "@devdigest/shared";
import brief from "../../../../../../../../messages/en/brief.json";
import { iconNameForKind, pickVerdictReview, reviewCounts, riskRef } from "./helpers";

function review(over: Partial<ReviewRecord> & { id: string; created_at: string }): ReviewRecord {
  return {
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    findings: [],
    ...over,
  };
}

function readRaw(): string {
  return readFileSync(resolve(__dirname, "../../../../../../../../messages/en/brief.json"), "utf8");
}

const finding = (severity: string, dismissed_at: string | null = null) =>
  ({ severity, dismissed_at }) as unknown as FindingRecord;

const risk = (over: Partial<BriefRiskRecord>): BriefRiskRecord => ({
  file_refs: ["src/a.ts", "src/b.ts"],
  explanation: "x",
  title: "t",
  kind: "other",
  severity: "low",
  ...over,
});

describe("pickVerdictReview", () => {
  it("skips a newer review with no verdict and falls back to an older one", () => {
    const older = review({ id: "old", created_at: "2026-01-01T00:00:00Z", verdict: "approve" });
    const newer = review({ id: "new", created_at: "2026-02-01T00:00:00Z", verdict: null });
    expect(pickVerdictReview([newer, older])?.id).toBe("old");
    expect(pickVerdictReview([older, newer])?.id).toBe("old");
  });

  it("picks the newest verdict review and returns null for no input", () => {
    const a = review({ id: "a", created_at: "2026-01-01T00:00:00Z", verdict: "approve" });
    const b = review({ id: "b", created_at: "2026-03-01T00:00:00Z", verdict: "comment" });
    expect(pickVerdictReview([a, b])?.id).toBe("b");
    expect(pickVerdictReview(undefined)).toBeNull();
    expect(pickVerdictReview(null)).toBeNull();
    expect(pickVerdictReview([])).toBeNull();
  });
});

describe("reviewCounts", () => {
  it("counts every finding but only open CRITICAL ones as blockers", () => {
    const r = review({
      id: "r",
      created_at: "2026-01-01T00:00:00Z",
      findings: [finding("CRITICAL"), finding("CRITICAL", "2026-01-02"), finding("MAJOR")],
    });
    expect(reviewCounts(r)).toEqual({ findings: 3, blockers: 1 });
  });
});

describe("iconNameForKind", () => {
  it("maps the five known kinds and falls back for everything else", () => {
    expect(iconNameForKind("security")).toBe("Shield");
    expect(iconNameForKind("db_migration")).toBe("Database");
    expect(iconNameForKind("breaking_api")).toBe("AlertOctagon");
    expect(iconNameForKind("perf")).toBe("Zap");
    expect(iconNameForKind("deps")).toBe("Boxes");
    for (const kind of ["other", "api-contract", "Security", "constructor", "toString", ""]) {
      expect(iconNameForKind(kind)).toBe("AlertTriangle");
    }
  });
});

describe("riskRef", () => {
  it("shows file:line only for a numeric line; missing and null show the file", () => {
    expect(riskRef(risk({ line: 12 }))).toBe("src/a.ts:12");
    expect(riskRef(risk({ line: null }))).toBe("src/a.ts");
    expect(riskRef(risk({}))).toBe("src/a.ts");
  });
});

describe("brief.json", () => {
  it("has no duplicate keys at any level", () => {
    const raw = readRaw();
    const stack: Set<string>[] = [];
    const dupes: string[] = [];
    for (const m of raw.matchAll(/([{}])|"((?:[^"\\]|\\.)*)"\s*:/g)) {
      if (m[1] === "{") stack.push(new Set());
      else if (m[1] === "}") stack.pop();
      else {
        const top = stack[stack.length - 1];
        if (top?.has(m[2]!)) dupes.push(m[2]!);
        top?.add(m[2]!);
      }
    }
    expect(dupes).toEqual([]);
    expect(brief.brief.emptyTitle).toBe("No brief yet");
  });
});
