import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const PREVIEW: SkillImportPreview = {
  name: "boundary-cases",
  description: "Flag missing limit tests.",
  type: "rubric",
  body: "# Boundaries\nTest 0, 1 and max.",
  source_file: "boundary/SKILL.md",
  ignored_files: ["boundary/scripts/setup.sh"],
  warnings: ["1 executable file(s) were ignored: they are never run, stored, or sent to a model."],
};

const state = vi.hoisted(() => ({ data: undefined as SkillImportPreview | undefined, mutate: vi.fn(), create: vi.fn() }));
vi.mock("../../../../lib/hooks/skills", () => ({
  useSkillImportPreview: () => ({ data: state.data, mutate: state.mutate, reset: vi.fn(), isPending: false, isError: false }),
  useCreateSkill: () => ({ mutate: state.create }),
}));

import { ImportSkillModal } from "./ImportSkillModal";

afterEach(() => {
  cleanup();
  state.data = undefined;
  state.mutate.mockClear();
});

function renderModal(onContinue = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ImportSkillModal onClose={vi.fn()} onContinue={onContinue} />
    </NextIntlClientProvider>,
  );
  return onContinue;
}

describe("ImportSkillModal", () => {
  it("warns about trust and uploads the picked file as base64 for a server-side preview", async () => {
    renderModal();
    expect(screen.getByRole("note")).toHaveTextContent("A third-party skill is third-party instructions");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    const file = new File(["# Hi"], "hi.md", { type: "text/markdown" });
    fireEvent.change(screen.getByTestId("skill-import-input"), { target: { files: [file] } });
    await waitFor(() => expect(state.mutate).toHaveBeenCalledWith({ filename: "hi.md", content_base64: btoa("# Hi") }));
  });

  it("shows the rendered core and the ignored files, and only hands the preview on (never saves)", () => {
    state.data = PREVIEW;
    const onContinue = renderModal();
    expect(screen.getByRole("heading", { name: "Boundaries" })).toBeInTheDocument();
    expect(screen.getByText("Skill core: boundary/SKILL.md")).toBeInTheDocument();
    expect(screen.getByText("Ignored files (never executed or stored)")).toBeInTheDocument();
    expect(screen.getByText("boundary/scripts/setup.sh")).toBeInTheDocument();
    expect(screen.getByText(/executable file\(s\) were ignored/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledWith(PREVIEW, "");
    expect(state.create).not.toHaveBeenCalled();
  });
});
