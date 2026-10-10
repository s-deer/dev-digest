import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PRDetailPage from "./page";

const nav = vi.hoisted(() => ({
  search: "tab=overview",
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1", number: "7" }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));
vi.mock("../../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => <div>nf</div> }));
vi.mock("../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "o/r" } }),
  useRepoNotFound: () => false,
}));
vi.mock("../../../../../lib/hooks", () => ({
  usePulls: () => ({ data: [{ id: "pr1", number: 7 }], isLoading: false }),
  usePullDetail: () => ({
    data: { number: 7, head_sha: "abc", body: null, files: [], files_count: 0, commits: [], status: "open" },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../../../../lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [], refetch: vi.fn() }),
  useCancelRun: () => ({}),
  usePrActiveRuns: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
  useDeleteRun: () => ({ mutate: vi.fn() }),
}));
vi.mock("./_components/PrDetailHeader", () => ({
  PrDetailHeader: ({ onSetTab }: { onSetTab: (t: string) => void }) => (
    <button onClick={() => onSetTab("findings")}>go findings</button>
  ),
}));
vi.mock("./_components/FindingsTab", () => ({ FindingsTab: () => <div>findings tab</div> }));
vi.mock("./_components/OverviewTab", () => ({
  OverviewTab: ({ onOpenFile }: { onOpenFile: (f: string, l: number | null) => void }) => (
    <>
      <button onClick={() => onOpenFile("src/a b.ts", 42)}>open with line</button>
      <button onClick={() => onOpenFile("src/a.ts", null)}>open file only</button>
    </>
  ),
}));
vi.mock("./_components/DiffTab", () => ({
  parseDiffTarget: (sp: { get(k: string): string | null }) =>
    sp.get("file") ? { file: sp.get("file"), line: sp.get("line") ? Number(sp.get("line")) : null } : null,
  DiffTab: ({ target }: { target: { file: string; line: number | null } | null }) => (
    <div>{target ? `target ${target.file}:${target.line ?? "-"}` : "no target"}</div>
  ),
}));
vi.mock("./_components/RunTraceDrawer", () => ({ default: () => null }));

beforeEach(() => {
  nav.search = "tab=overview";
  nav.push.mockReset();
  nav.replace.mockReset();
});
afterEach(cleanup);

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <PRDetailPage />
    </QueryClientProvider>,
  );
}

function qs(url: string) {
  return new URLSearchParams(url.split("?")[1]);
}

describe("PRDetailPage deep links (AC-52)", () => {
  it("opening a file from the brief pushes a history entry on the diff tab with encoded file and optional line", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "open with line" }));
    expect(nav.replace).not.toHaveBeenCalled();
    expect(nav.push).toHaveBeenCalledTimes(1);
    const url = nav.push.mock.calls[0]![0] as string;
    expect(url.startsWith("/repos/r1/pulls/7?")).toBe(true);
    expect(url).not.toContain(" ");
    const p = qs(url);
    expect([p.get("tab"), p.get("file"), p.get("line")]).toEqual(["diff", "src/a b.ts", "42"]);

    fireEvent.click(screen.getByRole("button", { name: "open file only" }));
    const p2 = qs(nav.push.mock.calls[1]![0] as string);
    expect([p2.get("file"), p2.has("line")]).toEqual(["src/a.ts", false]);
  });

  it("switching tab replaces (no history entry) and drops a stale file/line target", () => {
    nav.search = "tab=diff&file=src%2Fa.ts&line=3";
    renderPage();
    expect(screen.getByText("target src/a.ts:3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "go findings" }));
    expect(nav.push).not.toHaveBeenCalled();
    const p = qs(nav.replace.mock.calls[0]![0] as string);
    expect([p.get("tab"), p.has("file"), p.has("line")]).toEqual(["findings", false, false]);
  });

  it("loading the Files changed address without file params renders the diff with no target", () => {
    nav.search = "tab=diff";
    renderPage();
    expect(screen.getByText("no target")).toBeInTheDocument();
  });
});
