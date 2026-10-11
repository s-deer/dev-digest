# Plan verification: PR Brief design alignment (revision 2)

- **Plan:** `docs/plans/pr-brief-design-alignment-plan.md` (approved 2026-10-11)
- **Spec:** `specs/2026-10-10-pr-brief.md` (revision 2, R2-5 and R2-6 applied)
- **Base:** HEAD `390d398`. Revision 2 is uncommitted, because the user chose one commit at the end.
- **Verifier:** `plan-verifier` (sonnet), run twice, 2026-10-11

**Final verdict:** VERIFIED WITH GAPS. MET 116 · PARTIAL 0 · NOT MET 0, plus 1 accepted deviation (AC-58) · UNVERIFIABLE 3

## Run history

| Run | Verdict | Counts | Open rows |
|---|---|---|---|
| 1 | NOT VERIFIED | MET 111 · PARTIAL 3 · NOT MET 2 · UNVERIFIABLE 3 | AC-58 (not met), AC-64, AC-65, AC-67 (partial), EC-49 untested, 4 files outside the inventory |
| Fix pass | — | — | See the next table. |
| 2 | VERIFIED WITH GAPS | MET 116 · accepted deviation 1 · UNVERIFIABLE 3 | AC-58 (accepted deviation), the 3 manual or live checks |

Fix pass between the runs (one pass, as `/run-plan` allows):

| Row | Fix |
|---|---|
| AC-65 | `BriefBanner.tsx` always renders "N findings · M blockers", including 0, as the spec and design show. `BriefCard.test.tsx` asserts "0 findings · 0 blockers". |
| AC-67 | `brief.json` `brief.hint`: "Verdict, findings and score come from the latest agent review. The summary, risks, review focus, cost and tokens come from the brief." A test asserts the hint's accessible description and title. |
| AC-64 | Spec amended by **R2-6**, the user-accepted plan decision D-f. The "Intent" heading appears exactly once while Intent is ready and is absent while it is loading, empty or failed. EC-49 was amended to match. |
| EC-49 | New `it.each` test in `BriefCard.test.tsx`: "EC-49: Intent %s state does not hide the brief and has no Intent heading". |
| Scope drift | These changes are declared deviations, confined to their stated purpose:<br>• `IntentCard/_components/IntentSkeleton/IntentSkeleton.tsx`: compact skeleton for embedding (S7).<br>• `IntentCard/constants.ts`: unused `SKELETON_FOOTER_WIDTHS` removed.<br>• `client/INSIGHTS.md`, `server/INSIGHTS.md`: one engineering-insights entry each, as CLAUDE.md requires. |

## Traceability matrix (run 2)

| ID | Item | Task | Test | Commit | Method | Status | Evidence |
|---|---|---|---|---|---|---|---|
| S1–S13, INV, SCOPE.out, AC-1/4/5/8/10/13/16/37/41/45/51/52/54/63/66/68–78, EC-33…EC-48, EC-50, EC-51, NFR-1/4/6/7/8 | unchanged since run 1 | S1–S13 | as in run 1 | uncommitted | inspection + test | MET | Run-1 evidence stands. In run 2, server `pnpm test` has 461 passing and client `pnpm test` has 194 passing. Both typechecks exit 0, and the two `brief.ts` copies are identical. |
| AC-64 | The "Intent" heading appears once only while Intent is ready (R2-6) | S7 | `BriefCard.test.tsx` | uncommitted | test + spec | MET | Spec amended by R2-6. The test passes. |
| AC-65 | The banner always shows "N findings · M blockers" | S8 | `BriefCard.test.tsx:206` | uncommitted | inspection + test | MET | `BriefBanner.tsx:51-52` renders the blockers count unconditionally. |
| AC-67 | The hint names the source of each part | S8 | `BriefCard.test.tsx` | uncommitted | inspection + test | MET | `brief.json:51` |
| EC-49 | A loading, empty or failed Intent does not hide the brief, and no Intent heading shows | S7, S8 | `BriefCard.test.tsx:386` | uncommitted | test | MET | 3 cases pass. |
| AC-41 contract | Both vendored `brief.ts` copies carry the same change | S1 | server brief tests | uncommitted | inspection | MET | `line` is `.nullable()` in `BriefRiskOut`. `BriefRiskRecord` has `line` `.nullish()`. The counters are optional. No migration. |
| AC-58 | Spec and plan committed before the first revision-2 code commit | Final | — | uncommitted | demonstration | ACCEPTED DEVIATION | The user explicitly chose a single commit at the end, so the required order cannot be shown. |
| AC-60, E2E[2–7] | PR deliverables, manual `dev.sh` demo against `hw-01…03`, live-model check of the grounded risk `line` | — | — | — | — | UNVERIFIABLE | These need the browser, a live model and the PR. |

## Commands run (run 2)

| Command | Result |
|---|---|
| `cd server && pnpm typecheck` | exit 0 |
| `cd server && pnpm test` | exit 0; 55 files, 461 tests; `*.it.test.ts` ran against Docker |
| `cd client && pnpm typecheck` | exit 0 |
| `cd client && pnpm test` | exit 0; 49 files, 194 tests; only the existing recharts width(0) warning |
| `diff` of the two `brief.ts` copies | identical |

## Notes

- **Architecture review:** PASS WITH NOTES. A1 (low, optional) is left as is: `BriefBanner` imports `VERDICT_META` from `VerdictBanner/constants`. Moving it would mean editing `VerdictBanner`, which the plan keeps unchanged.
- **Test gaps reported by test-writer, with no spec row open:**
  - The rendered kind and heading icons are `aria-hidden`, so no component test can assert them. The kind→icon map is unit-tested in `helpers.test.ts`.
  - `IntentSkeleton` has no role or label, so the EC-49 loading case is asserted only by the absence of the other states.

## Unclosed before merge

- **AC-58:** accepted deviation (one commit at the end).
- **AC-60 and the manual checks** need:
  - `./scripts/dev.sh` plus a visual walk against `materials/5/images/hw-0{1,2,3}`;
  - one live-model generation, to check that `kind` values come from the enum and that risk lines fall inside changed ranges;
  - the PR description and the demo video.
