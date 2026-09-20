## What's in this PR

### 💰 Run cost
Each review run now gets its cost from the LLM provider. The cost is saved with the run and shown in the UI:
- in the PR list, next to each reviewed PR;
- in the verdict banner;
- in the agent-runs timeline and the run trace.

### 🔎 Findings by severity
Findings are easier to read and filter:
- the PR list and the agent-runs timeline show a count badge for each severity level, with a tooltip that breaks the counts down;
- review runs have severity pills that filter the findings;
- the findings popover has an "in this run" header, so you can see which run the findings came from.

### 🧠 Engineering Insights skill
A new agent skill, `engineering-insights`. It writes non-obvious engineering lessons into the right package's `INSIGHTS.md`, or the root one. Lessons include surprising root causes, abandoned approaches, tool quirks, trade-off decisions and user corrections. The next agent can then avoid repeating mistakes that were already made.

### 📚 Base documentation
- A root `AGENTS.md` (with `CLAUDE.md` symlinks) plus one for each package (`server`, `client`, `reviewer-core`, `e2e`). They cover the stack, commands, conventions, naming, gotchas and do-not-touch areas.
- Each package has a `specs/` → `docs/` → `INSIGHTS.md` structure.
- First docs: client data flow, the findings and cost UI, the run lifecycle and cost, the findings read model, the review pipeline, the LLM provider and cost, and how to write an e2e flow.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
