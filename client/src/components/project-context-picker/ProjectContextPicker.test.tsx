import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextAttachmentItem, ProjectDocument } from "@devdigest/shared";
import messages from "../../../messages/en/context.json";
import { ProjectContextPicker } from "./ProjectContextPicker";

const doc = vi.hoisted(() => ({
  content: "# Title\n\n<script>window.__pwned = true</script>\n\n![tracker](https://evil.example/pixel.png)\n\n[link](https://example.com)",
}));
vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDocument: (_repo: string, path: string) => ({
    data: { path, type: "docs", content: doc.content, tokens: 12, over_cap: false, used_by: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

const DOCS: ProjectDocument[] = [
  { path: "docs/architecture.md", type: "docs", tokens: 100, size: 400, over_cap: false, used_by_agents: 0 },
  { path: "specs/public-api.md", type: "specs", tokens: 50, size: 200, over_cap: false, used_by_agents: 1 },
  { path: "insights/perf.md", type: "insights", tokens: 30, size: 100, over_cap: false, used_by_agents: 0 },
];
const item = (path: string, tokens: number, missing = false): ProjectContextAttachmentItem => ({
  path,
  tokens,
  missing,
  over_cap: false,
});

/** Holds the "saved" paths the way a tab does, so each change round-trips. */
function Harness({ initial, repoId = "r1", onSave }: { initial: ProjectContextAttachmentItem[]; repoId?: string | null; onSave?: (p: string[]) => void }) {
  const [attached, setAttached] = React.useState(initial);
  return (
    <div>
      <output data-testid="saved">{attached.map((a) => a.path).join(",")}</output>
      <ProjectContextPicker
        repoId={repoId}
        documents={DOCS}
        attached={attached}
        onChange={(paths) => {
          onSave?.(paths);
          setAttached(paths.map((p) => item(p, DOCS.find((d) => d.path === p)?.tokens ?? 0, !DOCS.some((d) => d.path === p))));
        }}
      />
    </div>
  );
}

const renderPicker = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );

afterEach(() => cleanup());

describe("ProjectContextPicker", () => {
  it("attaches, reorders by keyboard buttons, filters, and detaches a missing doc", () => {
    const onSave = vi.fn();
    renderPicker(<Harness initial={[item("specs/public-api.md", 50), item("old/gone.md", 0, true)]} onSave={onSave} />);

    // Attach a doc: checkbox is found by role and a name containing the path.
    fireEvent.click(screen.getByRole("checkbox", { name: /docs\/architecture\.md/ }));
    expect(onSave).toHaveBeenLastCalledWith(["specs/public-api.md", "old/gone.md", "docs/architecture.md"]);

    // Reorder with the keyboard alternative to drag.
    fireEvent.click(screen.getByRole("button", { name: "Move docs/architecture.md up" }));
    expect(onSave).toHaveBeenLastCalledWith(["specs/public-api.md", "docs/architecture.md", "old/gone.md"]);
    expect(screen.getByRole("button", { name: "Move specs/public-api.md up" })).toBeDisabled();

    // Filtering never changes the attachments.
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter documents" }), { target: { value: "PERF" } });
    expect(screen.getByRole("checkbox", { name: /insights\/perf\.md/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /architecture/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("saved")).toHaveTextContent("specs/public-api.md,docs/architecture.md,old/gone.md");
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter documents" }), { target: { value: "" } });

    // A missing doc is marked and can only be detached.
    expect(screen.getByText("missing")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Detach old/gone.md" }));
    expect(onSave).toHaveBeenLastCalledWith(["specs/public-api.md", "docs/architecture.md"]);
    expect(screen.queryByText("missing")).not.toBeInTheDocument();
  });

  it("previews safely: script is inert, remote image is not rendered, focus returns to the trigger", () => {
    renderPicker(<Harness initial={[]} />);
    const trigger = screen.getByRole("button", { name: "Preview docs/architecture.md" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(dialog.querySelector("script")).toBeNull();
    expect(dialog.querySelector("img")).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    expect(within(dialog).getByRole("link", { name: "link" })).toHaveAttribute("rel", "noopener noreferrer");

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("without an active repository shows the select-a-repository prompt and no controls", () => {
    renderPicker(<Harness initial={[]} repoId={null} />);
    expect(screen.getByText("Select a repository")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
});
