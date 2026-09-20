import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const VERSIONS: SkillVersion[] = [
  { skill_id: "sk1", version: 2, body: "# Rule\nkeep\nnew line", note: null, created_at: "2026-09-19T10:00:00Z" },
  { skill_id: "sk1", version: 1, body: "# Rule\nkeep\nold line", note: "Imported from rule.md", created_at: "2026-09-18T10:00:00Z" },
];
const hooks = vi.hoisted(() => ({ restore: vi.fn() }));
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false }),
  useRestoreSkillVersion: () => ({ mutate: hooks.restore, isPending: false }),
}));

import { VersioningTab } from "./VersioningTab";

afterEach(cleanup);

const SKILL = { id: "sk1", version: 2, body: VERSIONS[0]!.body } as Skill;

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <VersioningTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("VersioningTab", () => {
  it("lists every version, marks the current one, and offers Diff/Restore only on older ones", () => {
    renderTab();
    expect(screen.getByText("2 versions")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText("Current")).toBeInTheDocument();
    expect(within(items[0]!).queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
    expect(within(items[1]!).getByText("Imported from rule.md")).toBeInTheDocument();
  });

  it("shows a line diff from the old version to the current body", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Diff" }));
    const diff = screen.getByTestId("version-diff");
    expect(diff.querySelector('[data-kind="del"]')).toHaveTextContent("old line");
    expect(diff.querySelector('[data-kind="add"]')).toHaveTextContent("new line");
  });

  it("restores only after confirmation", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("The body of v1 becomes the new current version v3.");
    expect(hooks.restore).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restore" }));
    expect(hooks.restore).toHaveBeenCalledWith({ id: "sk1", version: 1 }, expect.anything());
  });
});
