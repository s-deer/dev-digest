import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Sidebar } from "./Sidebar";

afterEach(() => cleanup());

describe("Sidebar", () => {
  it("has a Project Context entry that opens the active repository's context page (AC-14)", () => {
    render(<Sidebar ctx={{ repoId: "r1", activeKey: "context" }} />);
    const link = screen.getByText("Project Context").closest("a");
    expect(link).toHaveAttribute("href", "/repos/r1/context");
  });
});
