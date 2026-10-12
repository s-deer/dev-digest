import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../../messages/en/common.json";
import { OverviewTab } from "./OverviewTab";

vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ data: { brief: null, stale: false }, isLoading: false, isError: false, refetch: vi.fn() }),
  useGenerateBrief: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
  useGenerateIntent: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock("../BlastRadiusCard", () => ({ BlastRadiusCard: () => <div>blast</div> }));

afterEach(cleanup);

describe("OverviewTab", () => {
  it("has exactly one 'Generate brief' and one 'Derive intent' control", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ brief: messages, prReview, common }}>
        <OverviewTab prBody={null} prId="pr1" repoId="r1" repoFullName="o/r" headSha="abc" onOpenFile={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getAllByRole("button", { name: "Generate brief" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Derive intent" })).toHaveLength(1);
    expect(screen.getAllByText("PR Brief")).toHaveLength(1);
    expect(screen.getAllByText("No brief yet")).toHaveLength(1);
    expect(screen.getAllByText("No intent yet")).toHaveLength(1);
  });
});
