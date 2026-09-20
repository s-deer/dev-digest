import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../lib/toast";

const hooks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("../../../../lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: hooks.create, isPending: false }),
  useUpdateSkill: () => ({ mutate: hooks.update, isPending: false }),
}));

import { SkillFormModal, type SkillFormMode } from "./SkillFormModal";

afterEach(() => {
  cleanup();
  hooks.create.mockClear();
});

function renderModal(mode: SkillFormMode) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <SkillFormModal mode={mode} onClose={vi.fn()} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillFormModal", () => {
  it("keeps Save disabled until name, description and body are filled", () => {
    renderModal({ kind: "create" });
    const save = screen.getByRole("button", { name: "Save skill" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "flaky-tests" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), { target: { value: "Flag sleeps in tests." } });
    fireEvent.change(screen.getAllByRole("textbox").at(-1)!, { target: { value: "# Flaky\nNo sleeps." } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(hooks.create).toHaveBeenCalledWith(
      { name: "flaky-tests", description: "Flag sleeps in tests.", type: "custom", body: "# Flaky\nNo sleeps.", source: "manual" },
      expect.anything(),
    );
  });

  it("saves an import as imported_file with a version note, prefilled from the preview", () => {
    renderModal({
      kind: "import",
      filename: "pack.zip",
      preview: { name: "coverage", description: "Flag uncovered branches.", type: "rubric", body: "# Coverage", source_file: "SKILL.md", ignored_files: [], warnings: [] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));
    expect(hooks.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "coverage", type: "rubric", source: "imported_file", version_note: "Imported from pack.zip" }),
      expect.anything(),
    );
  });

  it("renders the body as Markdown in Preview mode", () => {
    renderModal({ kind: "import", filename: "x.md", preview: { name: "x", description: "d", type: "custom", body: "# Rendered title", source_file: "x.md", ignored_files: [], warnings: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("heading", { name: "Rendered title" })).toBeInTheDocument();
  });
});
