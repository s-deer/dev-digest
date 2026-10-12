# Cross-model review: PR Brief plan

- **Date:** 2026-10-10
- **Reviewer:** OpenAI Codex CLI 0.159.3, model `gpt-5.6-terra` (GPT family, reasoning effort high), `--sandbox read-only`, fresh session with no prior conversation
- **Artifacts reviewed:** `specs/2026-10-10-pr-brief.md` (approved), `docs/plans/pr-brief-plan.md` (draft), checked against the repository code
- **Cost:** 203 844 tokens (Codex session total)
- **Verdict:** APPROVE WITH CHANGES

## Dispositions

| # | Severity | Step | Finding (short) | Verified by main session | Decision |
|---|---|---|---|---|---|
| 1 | High | S7 | The 429 rate-limit test cannot pass: `buildApp` skips `@fastify/rate-limit` under `NODE_ENV=test` (`server/src/app.ts:103`) | Yes | **Accepted** |
| 2 | High | S10 | A load error replaces a cached brief with `ErrorState`, which violates AC-8 | Yes (plan S10 "State precedence") | **Accepted** |
| 3 | Medium | S4 | Workspace predicates are not explicit on the `agents` / `skills` joins | — | Declined by user |
| 4 | Medium | S5/S7 | AC-51 log line is not asserted at the route seam; no sentinel-text check | — | Declined by user |
| 5 | Low | §6 | NFR-5 timings are not verified | — | **Accepted** as a manual timing check |

Accepted fixes were applied by re-running `implementation-planner`, not by hand-editing the plan.

## Raw report

## Verdict

APPROVE WITH CHANGES

## Findings

1. **High — S7:** The planned rate-limit test cannot pass using the stated `intent.it.test.ts` pattern. That pattern builds with `NODE_ENV=test`, while the app does not register `@fastify/rate-limit` in test mode; route-level configuration alone has no plugin to enforce it. Evidence: [pr-brief-plan.md](/Users/alexey/my/dev-digest/docs/plans/pr-brief-plan.md:289), [pr-brief-plan.md](/Users/alexey/my/dev-digest/docs/plans/pr-brief-plan.md:298), [intent.it.test.ts](/Users/alexey/my/dev-digest/server/test/intent.it.test.ts:61), [app.ts](/Users/alexey/my/dev-digest/server/src/app.ts:101). Fix: add a test-only rate-limit registration option to `buildApp`, or construct this one test app with rate limiting explicitly enabled; assert the eleventh POST is 429 and adds no LLM call.

2. **High — S10:** The load-error branch hides a previously cached brief, contrary to AC-8. The plan preserves prior data only for a generation error; it specifies a full `ErrorState` for a load error. Evidence: [pr-brief-plan.md](/Users/alexey/my/dev-digest/docs/plans/pr-brief-plan.md:341), [pr-brief-plan.md](/Users/alexey/my/dev-digest/docs/plans/pr-brief-plan.md:344), [pr-brief spec](/Users/alexey/my/dev-digest/specs/2026-10-10-pr-brief.md:134). Fix: when `data.brief` exists, render it for either query-load or mutation failure, with an inline error and retry; use the full error state only when there is no cached brief. Add the load-refetch-error case to `BriefCard.test.tsx`.

3. **Medium — S4:** Tenancy is asserted but not specified for the two joins most likely to leak cross-workspace metadata. `latestRunAgent` only describes joins on run/PR/agent, and `enabledSkills` only says “both enabled”; neither explicitly requires `agents.workspace_id = ws` and `skills.workspace_id = ws`. The schema uses independent foreign keys, not a workspace-composite constraint. Evidence: [pr-brief-plan.md](/Users/alexey/my/dev-digest/docs/plans/pr-brief-plan.md:40), [pr-brief-plan.md](/Users/alexey/my/dev-digest/docs/plans/pr-brief-plan.md:202), [runs.ts](/Users/alexey/my/dev-digest/server/src/db/schema/runs.ts:10), [project-context repository](/Users/alexey/my/dev-digest/server/src/modules/project-context/repository.ts:153). Fix: require workspace predicates on `agent_runs`, `pull_requests`, `agents`, and `skills` in these queries; add an integration fixture with cross-workspace linked rows.

4. **Medium — S5/S7:** AC-51 is implemented conceptually but not tested at the route/logging seam. S5 checks an `onFinish` fake on one failure; S7 does not capture the Pino line, assert one line per completed generation, or prove that sentinel description/spec/model-output text is absent. Evidence: [pr-brief-plan.md](/Users/alexey/my/dev-digest/docs/plans/pr-brief-plan.md:249), [pr-brief-plan.md](/Users/alexey/my/dev-digest/docs/plans/pr-brief-plan.md:254), [pr-brief-plan.md](/Users/alexey/my/dev-digest/docs/plans/pr-brief-plan.md:290), [pr-brief spec](/Users/alexey/my/dev-digest/specs/2026-10-10-pr-brief.md:172). Fix: add unit assertions for success, budget rejection, and provider failure log payloads, plus one route-level captured-log assertion for the `brief: generated` line.

5. **Low — NFR-5 coverage:** The coverage table treats “GET does not call LLM/Intent/Blast” as performance verification, but it does not validate the stated local p95 ≤300 ms or ≤3 s non-model work budget. Evidence: [pr-brief-plan.md](/Users/alexey/my/dev-digest/docs/plans/pr-brief-plan.md:474), [pr-brief spec](/Users/alexey/my/dev-digest/specs/2026-10-10-pr-brief.md:208). Fix: add a lightweight manual timing acceptance to the verification checklist; no new benchmark framework is needed.

## Confirmed correct

- The proposed narrow server ports align with existing APIs: `BlastService.build`, `IntentService.get`, and `ProjectContextService.resolveForRun`. [blast service](/Users/alexey/my/dev-digest/server/src/modules/blast/service.ts:38), [intent service](/Users/alexey/my/dev-digest/server/src/modules/intent/service.ts:73), [project-context service](/Users/alexey/my/dev-digest/server/src/modules/project-context/service.ts:240)
- `pr_brief` already exists as one JSON record per PR, so no migration is necessary. [reviews schema](/Users/alexey/my/dev-digest/server/src/db/schema/reviews.ts:121)
- The tokenizer is injectable through the container, and the plan’s 8,000-token enforcement boundary is soundly placed before `completeStructured`. [container](/Users/alexey/my/dev-digest/server/src/platform/container.ts:206)
- Structured providers do accumulate tokens and attempts across repair re-asks, including Anthropic and OpenRouter—not just OpenAI. [OpenAI](/Users/alexey/my/dev-digest/server/src/adapters/llm/openai.ts:88), [Anthropic](/Users/alexey/my/dev-digest/server/src/adapters/llm/anthropic.ts:89), [OpenRouter](/Users/alexey/my/dev-digest/reviewer-core/src/llm/openrouter.ts:59)
- The deep-link approach fits the current client: Smart Diff groups are conditionally mounted, `FileCard` owns initial open state, and page navigation currently uses `router.replace`. [SmartDiffGroups](/Users/alexey/my/dev-digest/client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/SmartDiffGroups/SmartDiffGroups.tsx:29), [FileCard](/Users/alexey/my/dev-digest/client/src/components/diff-viewer/FileCard/FileCard.tsx:96), [page](/Users/alexey/my/dev-digest/client/src/app/repos/[repoId]/pulls/[number]/page.tsx:64)