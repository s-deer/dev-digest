#!/usr/bin/env node
// Stage 1 of /pr-self-review: collect the diff, run diff-rules + checks, route files to skills.
// Usage: node prepare.mjs [--base <ref>] [--it] [--no-tests]
// Writes .devdigest/cache/pr-self-review/work/<fingerprint>/prepare.json.
// If a deterministic critical is found, it also writes a BLOCK verdict right away and the
// LLM stage should be skipped.
import path from 'node:path';
import { rmSync } from 'node:fs';
import { CACHE_DIR, collectDiff, parseArgs, writeJson } from './lib.mjs';
import { diffRules } from './diff-rules.mjs';
import { checks } from './checks.mjs';
import { route } from './route.mjs';
import { buildVerdict, printReport, saveVerdict } from './verdict.mjs';

const args = parseArgs(process.argv.slice(2));
const diff = collectDiff(args.base);
const workDir = path.join(CACHE_DIR, 'work', diff.fingerprint);
rmSync(workDir, { recursive: true, force: true });

const ruleFindings = diffRules(diff);
const checkResult = await checks(diff, { it: Boolean(args.it), tests: !args['no-tests'] });
const routing = route(diff);

const prepare = {
  fingerprint: diff.fingerprint,
  baseRef: diff.baseRef,
  base: diff.base,
  head: diff.head,
  files: diff.files,
  ran: checkResult.ran,
  findings: [...ruleFindings, ...checkResult.findings],
  routing,
};
writeJson(path.join(workDir, 'prepare.json'), prepare);

const blocked = prepare.findings.some((f) => f.severity === 'critical');
if (blocked) {
  const verdict = buildVerdict(prepare, [], {}, []);
  verdict.stage = 'deterministic';
  saveVerdict(verdict);
  printReport(verdict);
  console.log('\nDeterministic critical found: the LLM stage is skipped. Fix and rerun /pr-self-review.');
  process.exit(0);
}

console.log(`fingerprint: ${diff.fingerprint}  (base ${diff.baseRef} @ ${diff.base.slice(0, 8)})`);
console.log(`work dir:    ${workDir}`);
console.log(`checks:      ${checkResult.ran.map((r) => `${r.package}:${r.check} ${r.ok ? 'ok' : 'FAIL'}`).join(', ') || 'none (no package touched)'}`);
const nonBlocking = prepare.findings.filter((f) => f.severity !== 'critical');
if (nonBlocking.length) console.log(`non-blocking deterministic findings: ${nonBlocking.length}`);
console.log('\nSkill assignments (one reviewer subagent per skill):');
const entries = Object.entries(routing.assignments);
if (!entries.length) console.log('  (none — nothing to review with skills)');
for (const [skill, files] of entries) console.log(`  ${skill}: ${files.length} file(s) → ${path.join(workDir, 'llm', `${skill}.json`)}`);
if (routing.unroutedSkills.length) console.log(`\nWARNING unrouted skill(s): ${routing.unroutedSkills.join(', ')} — add them to routing.md.`);
console.log(`\nunrouted files (no reviewer skill): ${routing.unroutedFiles.length}`);
