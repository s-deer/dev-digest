/* Pure helpers for DiffTab: pick the findings the diff should show inline
   (the latest review's, dismissed ones dropped), group them by file, and sum
   the toolbar's +/- totals. */
import type { ReviewRecord, FindingRecord, PrFile } from "@devdigest/shared";

/**
 * The newest `kind === 'review'` review's kept findings (dismissed ones
 * removed). Reviews aren't guaranteed to arrive newest-first, so "newest" is
 * decided by `created_at`, tie-broken by `id` (both descending) — the same
 * rule the server's smart-diff route uses (`desc(createdAt), desc(id)` in
 * `smart-diff/repository.ts`), so the two copies agree on which review wins.
 */
export function latestReviewFindings(reviews: ReviewRecord[]): FindingRecord[] {
  let latest: ReviewRecord | null = null;
  for (const r of reviews) {
    if (r.kind !== "review") continue;
    if (
      !latest ||
      r.created_at > latest.created_at ||
      (r.created_at === latest.created_at && r.id > latest.id)
    ) {
      latest = r;
    }
  }
  if (!latest) return [];
  return latest.findings.filter((f) => !f.dismissed_at);
}

/** Group findings by the file path they belong to (`FindingRecord.file`). */
export function findingsByPath(findings: FindingRecord[]): Map<string, FindingRecord[]> {
  const map = new Map<string, FindingRecord[]>();
  for (const f of findings) {
    const list = map.get(f.file);
    if (list) list.push(f);
    else map.set(f.file, [f]);
  }
  return map;
}

/** Whether at least one `kind === 'review'` review exists, regardless of
   findings. Lets the UI tell "no review has run yet" apart from "it ran and
   found nothing" instead of just showing zero counters either way. */
export function hasReview(reviews: ReviewRecord[]): boolean {
  return reviews.some((r) => r.kind === "review");
}

/** Sum of every file's additions/deletions, for the toolbar's "+N −N". */
export function diffTotals(files: PrFile[]): { add: number; del: number } {
  return files.reduce(
    (acc, f) => ({ add: acc.add + (f.additions ?? 0), del: acc.del + (f.deletions ?? 0) }),
    { add: 0, del: 0 },
  );
}
