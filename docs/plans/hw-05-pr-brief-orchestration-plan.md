# HW L05 — PR Why + Risk Brief: delivery plan

## Context
The homework (`materials/5/Homework - PR Why + Risk Brief.md`) adds a **PR Brief** card to the PR Overview tab. It shows an LLM-written **summary**, **Risk areas** (title + file) and **Review focus** (`file:line — reason`; clicking an item opens Files changed). Intent and Blast radius sit beside them. There is exactly **one** model call. It gets only facts DevDigest has already computed (intent, blast summary, diff stats, PR body, linked issue, attached specs) and **never diff hunks**. The result is cached in `pr_brief` with the head SHA inside the JSON.

The graded part is the **process**: `spec-creator → implementation-planner → /run-plan → plan-verifier`. The agents must write `spec.md` and `plan.md`; we only answer their questions and review. So this plan describes how to drive the pipeline and which decisions to feed it.

**Decisions made (2026-10-10):**
- Start a **fresh, leaner** run. `stash@{0}` (old 40-AC plan with no spec) stays untouched and unused.
- Scope: **P1 + P2 + cheap P3**: skeleton, labels from `brief.json`, "File not in this PR's diff", risk click-through.
- Out of scope: VerdictBanner, expandable risks, an e2e flow, and changes to provider retries.
- Cross-model review: **codex CLI (GPT)**, run from this session.
- Spec source for the brief: attachments of the **most recently run reviewer agent** on the repo, including its enabled skills. If there is no such agent, the brief says "no specs attached".

## Code reality the spec must reflect (verified by exploration)
| Homework says | Fork actually has |
|---|---|
| `getIntent(prId)` in `reviews/repository.ts` | Does not exist. Intent lives in `server/src/modules/intent/`:<br>• `IntentService.get(ws, prId)` → `PrIntentRecord \| null`, with `head_sha` and `stale`<br>• table `pr_intent` |
| Blast `GET /pulls/:id/blast` | `BlastService.build(ws, prId)` in `modules/blast/service.ts:38`, wired at `container.ts:163`.<br>• Returns `{changed_symbols, downstream[{callers[{file,line}]}], summary, degraded, reason}`<br>• No LLM call |
| Diff stats via `GET /pulls/:id` | `PrDetail` (`contracts/platform.ts:207`) built inline in `pulls/routes.ts:181`. Fields: `head_sha`, `body`, `files[{path,additions,deletions,patch}]`, `linked_issue?` (filled only on the Octokit path).<br>• Roles: `classifyFile(path)` in `smart-diff/classify.ts` (pure)<br>• `patch` must never reach the model. Hunk **headers** (`@@ -a,b +c,d @@`) are line ranges, not code, so they may be used to ground `line` |
| Model `risk_brief` | Already registered (`contracts/platform.ts:15-21`), and the Settings UI already shows it. Use `resolveFeatureModel(container, ws, 'risk_brief')` (`settings/feature-models.ts:51`) |
| `pr_brief(pr_id, json)` | Exists in `db/schema/reviews.ts:121` (migration 0000) but is unused. **No migration**: SHA, model and usage go inside `json` |
| `brief.ts` contracts | Both copies are identical. `PrBrief{intent,blast,risks,history}` has no `summary` / `review_focus`, and `Risk.file_refs` is `string[]`. Add new schemas to **both** copies. `SmartDiffRole` is a plain enum, not `{file,line,reason}` |
| `completeStructured` example in `reviews/` | Reviews go through reviewer-core. The direct example to mirror is `intent/service.ts:235` (narrow-deps ports, `resolveModel`, `llm`). `StructuredRequest` already has `maxRetries` (`vendor/shared/adapters.ts:55`) |
| Specs "attached to the reviewer" | `ProjectContextService.resolveForRun({workspaceId, repoId, owner, name, agentId, skills})` at `project-context/service.ts:240` renders untrusted blocks with token caps. It needs an agent, hence the decision above |
| UI | `OverviewTab` already renders `IntentCard` (labelled "PR Brief") and `BlastRadiusCard`.<br>• Hooks pattern: `client/src/lib/hooks/intent.ts`<br>• `page.tsx:62` reads only `?tab=`<br>• Files changed (`DiffTab` → `DiffViewer` → `FileCard`) has no file/line param and no scroll; `FileCard` open state is internal (`FileCard.tsx:96`). **Net-new work** |
| Labels `client/messages/en/brief.json` | Has `block.*`, `noRisks`, `unavailable*`, `intent.generate` = "Generate brief". New keys go under the existing namespace, with no duplicate top-level keys |

Applicable INSIGHTS to name to the agents:
- server: "fields the model must judge go after the fields it observes" → `file` / `evidence` come before `severity` in the output schema.
- server: "shared copies have drifted" → compare only `brief.ts` / `review-api.ts` between copies, not the whole vendor tree.
- server: "`*.it.test.ts` … must mock `llm.openrouter` and `github`".
- server: "`pnpm typecheck` does not type-check `server/test/**`".
- server: "same-file caller exclusion lives only in the repo-intel facade" → don't re-filter blast callers.
- client: "disabled TanStack Query keeps `isPending: true`".
- client: "duplicate top-level JSON keys".
- client: "`next-intl` logs `MISSING_MESSAGE`".
- root: "plan-verifier cannot run `pnpm build`".

## Stage 0 — Prep (main session)
1. Write this plan to `docs/plans/hw-05-pr-brief-orchestration-plan.md`. The same name exists only inside the stash, so it does not conflict.
2. Create branch `hw-l05-pr-brief` from `module-l05`. Leave the unrelated `.gitignore` change unstaged.
3. You (with my help if needed): `./scripts/dev.sh`, then `cd server && pnpm db:migrate`.
   - Pick a test PR that touches risky files (config, `package.json`, a shared helper or a migration) and generate its Intent and Blast once.
   - Attach ≥1 doc to a reviewer on the Project Context page, then run that reviewer once on the repo so it becomes "most recently run".

## Stage 1 — Spec (`spec-creator`, cross-module → `specs/2026-10-10-pr-brief.md`)
Prompt contents:
- The homework file as the source, plus the screenshots `materials/5/images/hw-0{1,2,3}*.jpg` as the design.
- The "Code reality" table and the INSIGHTS list above.
- The decisions above.
- The seeds below, each marked as a seed so the agent owns the wording and AC-IDs.

I relay its blocking questions to you through AskUserQuestion; nothing is answered by me silently.

Seeds:
- **Goals:** summary + risks + review focus on Overview; one model call; cached; reload shows the cached brief; a refresh button regenerates it.
- **Non-goals:**
  - no diff hunk bodies to the model
  - no prior-PR history
  - no automatic generation (only on click)
  - no streaming
  - no editing of the output
  - no VerdictBanner or expandable risks
  - no provider retry changes
- **Input budget with a unit:** **8 000 tokens** of model input (system + user), counted with the existing tokenizer.
  - Allocation: intent ≤ 600 · blast summary + caller files ≤ 1 500 · diff stats (path, +/−, role, hunk line ranges) ≤ 2 000 · PR body + linked issue ≤ 1 500 · specs ≤ 2 400.
  - Fixed truncation order: specs first, then the tail of the file list, then the body. Each truncation is recorded in the result.
- **Provenance table:**
  - Trusted (computed): stats, roles, hunk ranges, blast.
  - Untrusted: PR body, issue, specs, intent text derived from the PR.
  - Untrusted inputs go in delimited blocks with an injection guard (the existing `wrapUntrusted` convention).
- **Output contract:** `{ summary, risks[{kind,title,explanation,severity,file_refs[]}], review_focus[{file,line,reason}] }`, kept in reading order.
  - Added to **both** `brief.ts` copies.
  - The response is validated by the same Zod schema.
- **Grounding:**
  - Drop any risk or focus item whose file is in neither the PR files nor the blast caller files.
  - A focus `line` must lie inside a changed hunk range of that file, or match a blast caller line; otherwise the item is dropped.
  - Everything dropped → empty sections plus a note, not an error.
- **Missing facts:** no intent, a stale intent, degraded blast, no linked issue or no specs → generation still runs, and the brief lists which facts were missing.
- **Cache / SHA:**
  - `GET` returns the cached brief or `null`, plus `stale: true` when the stored `head_sha` ≠ the PR `head_sha`. The UI shows "outdated" and the refresh button, with no automatic regeneration.
  - `POST` always regenerates. It is rate-limited like intent (10/min). On failure the previous cache is untouched.
- **One call:** exactly one `completeStructured` invocation per POST. Open question for the spec: allow its built-in JSON-repair retry (record `attempts`) **or** pass `maxRetries: 0` (recommended: allow repair and record `attempts`). A log line records model, tokens in/out, attempts and input size; usage is stored in the JSON.
- **Navigation:**
  - A focus or risk click goes to `?tab=diff&file=<path>&line=<n>`. The diff expands that file and scrolls to and highlights the line.
  - A file outside the diff (a blast caller) shows "File not in this PR's diff".
- **UI states:** empty + "Generate brief" · skeleton while generating · error · ready · stale. All copy comes from `brief.json`.

**Review checklist** before I flip the status to `approved` (only on your OK):
- Goals and non-goals present, and every AC is testable EARS.
- The budget has a unit, and the provenance table exists.
- No `[NEEDS CLARIFICATION]` remains.
- Every homework P1/P2 row maps to an AC.

## Stage 2 — Plan (`implementation-planner` → `docs/plans/pr-brief-plan.md`)
1. **Pass 1:** I relay its questions. For execution mode the answer is **multi-agent, one implementer per phase** ([[phased-implementer-workflow]]).
2. **Pass 2:** I save its output verbatim. Sanity-check that its phases roughly follow this shape:
   - **A shared:** `brief.ts` in both copies, plus `review-api.ts` response types.
   - **B server:** new `modules/brief/` built onion-style, mirroring `modules/intent`:
     - `constants`, pure `domain` (input building with budgeting, grounding, staleness), `prompt`
     - `service` with narrow ports for intent, blast, PR snapshot without `patch`, specs, `resolveModel` and `llm`
     - Drizzle `repository` on `pr_brief`
     - `routes` (`GET`/`POST /pulls/:id/brief`)
     - registration in `modules/index.ts` and a `briefService` getter in `container.ts`
     - hermetic and `.it` tests
   - **C client:** `lib/hooks/brief.ts`; `_components/BriefCard/` in `OverviewTab`; `brief.json` keys; deep link in `page.tsx` + `DiffTab` + `DiffViewer`/`FileCard` (controlled open + line scroll); component tests.
   - **Push back** if it proposes a migration, changes to provider adapters or reviewer-core, an e2e flow, or concurrency queues. Those are out of the agreed scope.
3. **Cross-model review:**
   - Run `codex exec` read-only, sandboxed, from the repo root. Prompt: the cross-validation prompt from `materials/5/prompts.txt` + spec + plan.
   - Save the findings to `docs/plans/pr-brief-plan-crossreview.md` (model, findings, disposition).
   - Feed accepted fixes back by **re-running implementation-planner**, not by hand-editing. Then you approve and I set the plan status to `approved`.
4. **Commit gate (P2), on your go:** `docs(pr-brief): spec, plan and cross-model review` **before any code**.

## Stage 3 — Code (`/run-plan docs/plans/pr-brief-plan.md`)
- You invoke `/run-plan`. It runs one implementer per phase → architecture-reviewer → fix loop (≤ 2) → test-writer (limited, tests derived from ACs) → plan-verifier.
- I check every phase report before the next phase starts. On your go, each phase is committed separately (`feat(shared)`, `feat(server)`, `feat(client)`, `test(...)`).
- Guard rails: no edits in `server/clones/**`, migrations or lockfiles; pnpm in `server/` and `client/`.

## Stage 4 — Verify and submit
1. Save the plan-verifier report to `docs/plans/pr-brief-verification.md`, with zero NOT MET rows for P1.
2. Manual run with the real LLM, following the video script below. Check the server log for exactly **one** `brief: generated` line per POST, input tokens ≤ 8 000, and no `@@`/`+`/`-` code lines in the logged prompt size breakdown.
3. Optional: `doc-writer` (`server/docs/brief.md`), `/workflow-retro` → ledger row, `engineering-insights` sweep.
4. `/pr-self-review` (the hook gates `gh pr create` / push), then open the PR into `main` of your fork. The description covers:
   - the implementation
   - the cross-model note
   - the verifier report
   - links to the spec and plan
   - the video
5. Video (1–3 min):
   1. Overview → Generate brief.
   2. Summary / Risks / Focus + Intent / Blast.
   3. Click a focus item → Files changed on that line.
   4. Reload → instant.
   5. Show spec, plan and verifier in the PR.
   6. One sentence: the model gets bounded, precomputed facts rather than code, so input is small and cheap, paths can be checked, and code content can't steer it.

## Verification (end-to-end)
- Typecheck and tests:
  - `cd server && pnpm typecheck && pnpm test` (hermetic + `brief*.it.test.ts`)
  - `cd client && pnpm typecheck && pnpm test && pnpm build`
- `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` → no output.
- API (`curl` on :3001) on the test PR:
  - `GET /pulls/:id/brief` → `null`
  - `POST` → brief
  - `GET` again → same JSON, and the log shows no new LLM call
  - simulate a new SHA (seed or update `head_sha`) → `stale: true`
  - `POST` → regenerated
- Hermetic tests prove:
  - a mock LLM returning an invented path or an out-of-hunk line → item dropped
  - the built prompt contains no `patch` text and stays ≤ budget
  - the model id comes from the `risk_brief` setting
- UI: clicking a focus item lands on `?tab=diff&file=…&line=…` with the file expanded and the line in view; a blast-only file shows the not-in-diff message.
