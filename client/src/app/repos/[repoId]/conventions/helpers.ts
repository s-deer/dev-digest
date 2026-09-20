import type { ConventionCandidate, ConventionsState } from "@devdigest/shared";
import type { ConventionFilter } from "@/lib/hooks/conventions";

export function candidatesForFilter(
  state: ConventionsState | undefined,
  filter: ConventionFilter,
): ConventionCandidate[] {
  const candidates = state?.candidates ?? [];
  return filter === "all" ? candidates : candidates.filter((candidate) => candidate.status === filter);
}

export function acceptedCandidates(state: ConventionsState | undefined): ConventionCandidate[] {
  return (state?.candidates ?? []).filter((candidate) => candidate.status === "accepted");
}
