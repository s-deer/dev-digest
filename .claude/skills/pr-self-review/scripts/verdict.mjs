#!/usr/bin/env node
// Stage 3 of /pr-self-review: merge findings, triage criticals, write the verdict the gate reads.
//
//   node verdict.mjs triage                               list LLM criticals that still need verification
//   node verdict.mjs resolve --id <id> --confirm          critical is real (read the code first)
//   node verdict.mjs resolve --id <id> --downgrade <sev> --reason "<why>"
//   node verdict.mjs write                                merge everything, write verdict + report
//   node verdict.mjs waive --id <id> --reason "<why>"     ONLY on the user's explicit decision
//   node verdict.mjs show                                 print the latest verdict
//
// Every command recomputes the diff fingerprint and refuses to work on a stale work dir.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CACHE_DIR, collectDiff, finding, parseArgs, writeJson } from './lib.mjs';

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const readJson = (f, fallback) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fallback);
export const verdictPath = (fp) => path.join(CACHE_DIR, 'verdicts', `${fp}.json`);
export const latestPath = () => path.join(CACHE_DIR, 'latest.json');

/** Validates and normalizes reviewer output. Findings without a rule, file or evidence are dropped. */
function loadLlmFindings(workDir) {
  const dir = path.join(workDir, 'llm');
  const findings = [];
  const dropped = [];
  if (!existsSync(dir)) return { findings, dropped };
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const skill = name.replace(/\.json$/, '');
    const raw = readJson(path.join(dir, name), []);
    for (const f of Array.isArray(raw) ? raw : raw.findings ?? []) {
      const severity = String(f.severity ?? '').toLowerCase();
      if (!f.rule || !f.file || !f.evidence || !SEVERITIES.includes(severity)) {
        dropped.push({ skill, reason: 'missing rule/file/evidence or unknown severity', finding: f });
        continue;
      }
      findings.push({ ...finding({ ...f, source: skill, severity }), verified: false });
    }
  }
  return { findings, dropped };
}

export function buildVerdict(prepare, llm, triage, waivers, dropped = []) {
  const findings = [...prepare.findings, ...llm].map((f) => {
    const t = triage[f.id];
    if (f.severity !== 'critical' || f.verified || !t) return f;
    if (t.action === 'confirm') return { ...f, verified: true };
    return { ...f, severity: t.severity, downgradedFrom: 'critical', downgradeReason: t.reason };
  });
  const waived = new Set(waivers.map((w) => w.id));
  const blocking = findings.filter((f) => f.severity === 'critical' && f.verified && !waived.has(f.id)).map((f) => f.id);
  return {
    fingerprint: prepare.fingerprint,
    baseRef: prepare.baseRef,
    base: prepare.base,
    head: prepare.head,
    createdAt: new Date().toISOString(),
    stage: 'full',
    verdict: blocking.length ? 'BLOCK' : 'PASS',
    blocking,
    findings: findings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)),
    waivers,
    dropped,
    ran: prepare.ran,
    routing: prepare.routing,
  };
}

export function saveVerdict(verdict) {
  writeJson(verdictPath(verdict.fingerprint), verdict);
  writeJson(latestPath(), verdict);
}

const loc = (f) => (f.line ? `${f.file}:${f.line}` : f.file);

export function printReport(v) {
  const out = [];
  out.push(`# PR self-review: ${v.verdict === 'PASS' ? 'PASS ✅' : 'BLOCK ⛔'}`);
  out.push(`fingerprint ${v.fingerprint} · base ${v.baseRef} @ ${v.base.slice(0, 8)} · stage ${v.stage}`);

  const blocking = v.findings.filter((f) => v.blocking.includes(f.id));
  if (blocking.length) {
    out.push('\n## Blocking critical findings');
    const byFile = Object.groupBy(blocking, (f) => f.file);
    for (const [file, list] of Object.entries(byFile)) {
      out.push(`\n### ${file}`);
      for (const f of list) out.push(`- [${f.id}] ${loc(f)} — **${f.rule}** (${f.source})\n  ${f.evidence.split('\n').join('\n  ')}\n  fix: ${f.fix ?? '—'}`);
    }
  }

  for (const sev of ['high', 'medium', 'low']) {
    const list = v.findings.filter((f) => f.severity === sev);
    if (!list.length) continue;
    out.push(`\n## ${sev} (${list.length}, non-blocking)`);
    for (const f of list) {
      const note = f.downgradedFrom ? ` _(downgraded from critical: ${f.downgradeReason})_` : '';
      out.push(`- [${f.id}] ${loc(f)} — ${f.rule} (${f.source})${note}: ${f.evidence.split('\n')[0]}`);
    }
  }

  if (v.waivers.length) {
    out.push('\n## Waived by the user');
    for (const w of v.waivers) out.push(`- [${w.id}] ${w.reason} (${w.at})`);
  }
  const skills = Object.entries(v.routing?.assignments ?? {});
  if (skills.length) out.push(`\n## Skills run\n${skills.map(([s, f]) => `- ${s}: ${f.length} file(s)`).join('\n')}`);
  if (v.ran?.length) out.push(`\n## Checks\n${v.ran.map((r) => `- ${r.package} ${r.check}: ${r.ok ? 'ok' : 'FAIL'}`).join('\n')}`);
  if (v.routing?.unroutedSkills?.length) out.push(`\n⚠️ unrouted skill(s): ${v.routing.unroutedSkills.join(', ')} — add to routing.md`);
  if (v.dropped?.length) out.push(`\n⚠️ ${v.dropped.length} reviewer finding(s) dropped as malformed (no rule/file/evidence).`);
  console.log(out.join('\n'));
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function context(args) {
  const latest = readJson(latestPath(), null);
  const diff = collectDiff(args.base ?? latest?.baseRef);
  const workDir = path.join(CACHE_DIR, 'work', diff.fingerprint);
  const prepare = readJson(path.join(workDir, 'prepare.json'), null);
  if (!prepare) fail(`No prepare.json for the current diff (fingerprint ${diff.fingerprint}). The files changed since the last run — run prepare.mjs again.`);
  return { diff, workDir, prepare, triageFile: path.join(workDir, 'triage.json') };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (cmd === 'show') {
    const latest = readJson(latestPath(), null);
    if (!latest) fail('No verdict yet. Run /pr-self-review.');
    printReport(latest);
  } else if (cmd === 'triage') {
    const { workDir, triageFile } = context(args);
    const triage = readJson(triageFile, {});
    const { findings, dropped } = loadLlmFindings(workDir);
    const open = findings.filter((f) => f.severity === 'critical' && !triage[f.id]);
    console.log(JSON.stringify({ pending: open, resolved: Object.keys(triage).length, dropped: dropped.length }, null, 2));
  } else if (cmd === 'resolve') {
    const { workDir, triageFile } = context(args);
    const { findings } = loadLlmFindings(workDir);
    if (!findings.some((f) => f.id === args.id && f.severity === 'critical')) fail(`No LLM critical finding with id ${args.id}.`);
    const triage = readJson(triageFile, {});
    if (args.confirm) triage[args.id] = { action: 'confirm' };
    else if (['high', 'medium', 'low'].includes(args.downgrade) && typeof args.reason === 'string') {
      triage[args.id] = { action: 'downgrade', severity: args.downgrade, reason: args.reason };
    } else fail('Use --confirm, or --downgrade high|medium|low --reason "<why>".');
    writeJson(triageFile, triage);
    console.log(`${args.id}: ${triage[args.id].action}`);
  } else if (cmd === 'write') {
    const { workDir, prepare, triageFile } = context(args);
    const triage = readJson(triageFile, {});
    const { findings, dropped } = loadLlmFindings(workDir);
    const pending = findings.filter((f) => f.severity === 'critical' && !triage[f.id]);
    if (pending.length) fail(`${pending.length} critical finding(s) not triaged yet: ${pending.map((f) => f.id).join(', ')}. Verify each one against the code, then run resolve.`);
    const verdict = buildVerdict(prepare, findings, triage, [], dropped);
    saveVerdict(verdict);
    printReport(verdict);
  } else if (cmd === 'waive') {
    const latest = readJson(latestPath(), null);
    if (!latest) fail('No verdict yet. Run /pr-self-review.');
    const diff = collectDiff(latest.baseRef);
    if (diff.fingerprint !== latest.fingerprint) fail('The diff changed since the last verdict. Rerun /pr-self-review before waiving.');
    if (!latest.blocking.includes(args.id)) fail(`${args.id} is not a blocking finding.`);
    if (typeof args.reason !== 'string' || args.reason.trim().length < 10) fail('A waiver needs --reason "<the user\'s reason>" (at least 10 characters).');
    const waivers = [...latest.waivers, { id: args.id, reason: args.reason.trim(), at: new Date().toISOString() }];
    const waived = new Set(waivers.map((w) => w.id));
    const blocking = latest.blocking.filter((id) => !waived.has(id));
    const verdict = { ...latest, waivers, blocking, verdict: blocking.length ? 'BLOCK' : 'PASS' };
    saveVerdict(verdict);
    printReport(verdict);
  } else {
    fail('Usage: verdict.mjs triage | resolve | write | waive | show  (see header comment)');
  }
}
