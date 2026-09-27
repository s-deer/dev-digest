import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, SmartDiffGroup } from "@devdigest/shared";
import shell from "../../../../../../../../../../messages/en/shell.json";
import prReview from "../../../../../../../../../../messages/en/prReview.json";
import { SmartDiffGroups } from "./SmartDiffGroups";

afterEach(cleanup);

function file(path: string, additions = 1, deletions = 0): PrFile {
  return { path, additions, deletions, patch: ["@@ -1,1 +1,2 @@", "+line"].join("\n") };
}

const CORE_A = file("src/config.ts");
const CORE_B = file("src/service.ts");
const TEST_A = file("src/config.test.ts");
const DOC_A = file("docs/readme.md");
const LOCK = file("pnpm-lock.yaml", 92, 24);

// Core has two files with findings (5 finding_lines between them) — the
// header counter must read "2", not "5".
const GROUPS: SmartDiffGroup[] = [
  {
    role: "core",
    files: [
      { path: CORE_A.path, additions: CORE_A.additions, deletions: CORE_A.deletions, finding_lines: [2, 3] },
      { path: CORE_B.path, additions: CORE_B.additions, deletions: CORE_B.deletions, finding_lines: [2, 5, 8] },
    ],
  },
  {
    role: "tests",
    files: [{ path: TEST_A.path, additions: TEST_A.additions, deletions: TEST_A.deletions, finding_lines: [] }],
  },
  {
    role: "docs",
    files: [{ path: DOC_A.path, additions: DOC_A.additions, deletions: DOC_A.deletions, finding_lines: [] }],
  },
  {
    role: "boilerplate",
    files: [{ path: LOCK.path, additions: LOCK.additions, deletions: LOCK.deletions, finding_lines: [] }],
  },
];

const FILES = [CORE_A, CORE_B, TEST_A, DOC_A, LOCK];

function renderGroups() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <SmartDiffGroups groups={GROUPS} files={FILES} />
    </NextIntlClientProvider>,
  );
}

describe("SmartDiffGroups", () => {
  it("renders groups in role order with labels and per-group file counts; docs/boilerplate start collapsed and the counter counts files, not findings", () => {
    renderGroups();

    const labels = screen.getAllByText(/^(Core|Tests|Docs|Boilerplate)$/);
    expect(labels.map((el) => el.textContent)).toEqual(["Core", "Tests", "Docs", "Boilerplate"]);

    // core/tests start open: their files are already visible.
    expect(screen.getByText(CORE_A.path)).toBeInTheDocument();
    expect(screen.getByText(TEST_A.path)).toBeInTheDocument();

    // docs/boilerplate start collapsed: their files aren't rendered yet.
    expect(screen.queryByText(DOC_A.path)).not.toBeInTheDocument();
    expect(screen.queryByText(LOCK.path)).not.toBeInTheDocument();

    // Core's counter: 2 files have findings (5 finding_lines total) → "● 2".
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("2 files")).toBeInTheDocument();

    // Expand boilerplate → the lock file appears.
    fireEvent.click(screen.getByText("Boilerplate"));
    expect(screen.getByText(LOCK.path)).toBeInTheDocument();
  });
});
