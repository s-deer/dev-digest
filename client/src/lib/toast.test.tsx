import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ToastProvider, notify } from "./toast";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mount() {
  render(
    <ToastProvider>
      <div />
    </ToastProvider>,
  );
}

describe("toast", () => {
  it("a warn toast with a custom duration is gone at that duration", () => {
    mount();
    act(() => notify.warn("File not in diff", { durationMs: 2600 }));
    expect(screen.getByText("File not in diff")).toBeInTheDocument();
    expect(screen.getByText("⚠")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2599));
    expect(screen.getByText("File not in diff")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText("File not in diff")).not.toBeInTheDocument();
  });

  it("a repeated key keeps one toast and restarts the timer", () => {
    mount();
    act(() => notify.warn("Not in diff", { durationMs: 2600, key: "nid" }));
    act(() => vi.advanceTimersByTime(2000));
    act(() => notify.warn("Not in diff", { durationMs: 2600, key: "nid" }));
    expect(screen.getAllByText("Not in diff")).toHaveLength(1);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getAllByText("Not in diff")).toHaveLength(1);
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByText("Not in diff")).not.toBeInTheDocument();
  });

  it("the default toast still lasts 4000 ms", () => {
    mount();
    act(() => notify.info("Saved"));
    act(() => vi.advanceTimersByTime(3999));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });
});
