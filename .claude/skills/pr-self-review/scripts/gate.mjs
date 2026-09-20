#!/usr/bin/env node
// Blocks opening/merging a PR and pushing unless the current diff has a PASS verdict.
//
//   --hook  Claude Code PreToolUse hook on Bash. Reads the hook JSON from stdin and only
//           gates `gh pr create`, `gh pr merge` and `git push`. Exit 2 = deny (stderr goes to Claude).
//   --git   git pre-push hook (.githooks/pre-push). Exit 1 = push aborted.
//
// A verdict is valid only for the exact content it reviewed (fingerprint), so any edit after
// the review requires a new /pr-self-review run.
import { existsSync, readFileSync } from 'node:fs';

const GATED = /(^|[;&|(\s])(gh\s+pr\s+(create|merge)|git\s+(-C\s+\S+\s+)?push)\b/;
const mode = process.argv.includes('--git') ? 'git' : 'hook';

if (mode === 'hook') {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  let command = '';
  try {
    command = JSON.parse(input)?.tool_input?.command ?? '';
  } catch {
    process.exit(0);
  }
  if (!GATED.test(command)) process.exit(0);
}

// Imported lazily: most Bash calls exit above without touching git.
const { CACHE_DIR, collectDiff } = await import('./lib.mjs');
const { verdictPath, latestPath } = await import('./verdict.mjs');

const deny = (msg) => {
  console.error(`pr-self-review gate: ${msg}`);
  process.exit(mode === 'hook' ? 2 : 1);
};

const latest = existsSync(latestPath()) ? JSON.parse(readFileSync(latestPath(), 'utf8')) : null;
let diff;
try {
  diff = collectDiff(latest?.baseRef);
} catch (err) {
  deny(`cannot compute the diff (${err.message}).`);
}
const file = verdictPath(diff.fingerprint);

if (!existsSync(file)) {
  deny(
    `no self-review verdict for the current changes (fingerprint ${diff.fingerprint}). ` +
      `Run /pr-self-review first${latest ? '; the files changed since the last review' : ''}. ` +
      `(verdicts: ${CACHE_DIR})`,
  );
}

const verdict = JSON.parse(readFileSync(file, 'utf8'));
if (verdict.verdict !== 'PASS') {
  const list = verdict.findings
    .filter((f) => verdict.blocking.includes(f.id))
    .map((f) => `  - [${f.id}] ${f.line ? `${f.file}:${f.line}` : f.file} — ${f.rule}`)
    .join('\n');
  deny(
    `BLOCK — ${verdict.blocking.length} critical finding(s) must be fixed first:\n${list}\n` +
      'Fix them and rerun /pr-self-review. Only the user may waive a finding; never waive on your own.',
  );
}
process.exit(0);
