#!/usr/bin/env node
// Deterministic checks that run before any LLM review:
//   1. typecheck + hermetic tests of every package the diff touches, each with its own
//      package manager (pnpm: server, client; npm: reviewer-core, e2e);
//   2. onion-lint: added imports that break the dependency rule in inner-ring server files.
// Usage: node checks.mjs [--base <ref>] [--it] [--no-tests]
//   --it        also run server *.it.test.ts (needs Docker)
//   --no-tests  typecheck only
// Prints { fingerprint, ran[], findings[] }. Exit code is always 0; the verdict decides.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, addedLines, collectDiff, finding, parseArgs } from './lib.mjs';

const SHARED_CONTRACT = /^server\/src\/vendor\/shared\//;

function packageCommands({ it, tests }) {
  return {
    server: [
      ['typecheck', 'pnpm', ['typecheck']],
      // Unit lane as in TESTING.md; --it runs everything including testcontainers suites.
      tests && ['test', 'pnpm', it ? ['exec', 'vitest', 'run'] : ['exec', 'vitest', 'run', '--exclude', '**/*.it.test.ts']],
    ],
    client: [
      ['typecheck', 'pnpm', ['typecheck']],
      tests && ['test', 'pnpm', ['test']],
    ],
    'reviewer-core': [
      ['typecheck', 'npm', ['run', 'typecheck']],
      tests && ['test', 'npm', ['test']],
    ],
    // e2e flows need the full stack; only the typecheck is hermetic.
    e2e: [['typecheck', 'npm', ['run', 'typecheck']]],
  };
}

function touchedPackages(files) {
  const touched = new Set();
  for (const { path: p } of files) {
    const top = p.split('/')[0];
    if (['server', 'client', 'reviewer-core', 'e2e'].includes(top)) touched.add(top);
    // server consumes reviewer-core as TypeScript source via a path alias.
    if (top === 'reviewer-core' && p.startsWith('reviewer-core/src/')) touched.add('server');
    // Contract-first: a change in @devdigest/shared must still typecheck in its consumers.
    if (SHARED_CONTRACT.test(p)) touched.add('client');
  }
  return [...touched];
}

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, CI: '1', FORCE_COLOR: '0' } });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (err) => resolve({ code: 127, out: String(err) }));
    child.on('close', (code) => resolve({ code, out }));
  });
}

function tail(text, n = 60) {
  return text.trimEnd().split('\n').slice(-n).join('\n');
}

async function packageChecks(diff, opts) {
  const findings = [];
  const ran = [];
  const contractChanged = diff.files.some((f) => SHARED_CONTRACT.test(f.path));
  const commands = packageCommands(opts);

  await Promise.all(
    touchedPackages(diff.files).map(async (pkg) => {
      const cwd = path.join(ROOT, pkg);
      if (!existsSync(path.join(cwd, 'node_modules'))) {
        findings.push(
          finding({
            source: 'checks',
            severity: 'critical',
            rule: 'checks/deps-missing',
            file: `${pkg}/package.json`,
            evidence: `${pkg}/node_modules is missing, so ${pkg} cannot be verified.`,
            fix: `cd ${pkg} && ${pkg === 'server' || pkg === 'client' ? 'pnpm install' : 'npm install'}`,
          }),
        );
        return;
      }
      // Sequential inside a package: tests after typecheck, so the first failure is readable.
      for (const [name, cmd, args] of commands[pkg].filter(Boolean)) {
        const started = Date.now();
        const { code, out } = await run(cmd, args, cwd);
        ran.push({ package: pkg, check: name, command: `${cmd} ${args.join(' ')}`, ok: code === 0, ms: Date.now() - started });
        if (code === 0) continue;
        const contract = contractChanged && name === 'typecheck' && pkg !== 'reviewer-core';
        findings.push(
          finding({
            source: 'checks',
            severity: 'critical',
            rule: contract ? `contract-first/${pkg}-typecheck` : `checks/${pkg}-${name}`,
            file: `${pkg}/package.json`,
            evidence: `${contract ? '@devdigest/shared changed and ' : ''}\`cd ${pkg} && ${cmd} ${args.join(' ')}\` failed (exit ${code}):\n${tail(out)}`,
            fix: contract
              ? 'Update the consumers of the changed contract (contracts change in @devdigest/shared first, then in consumers).'
              : `Run \`cd ${pkg} && ${cmd} ${args.join(' ')}\` and fix the failures.`,
          }),
        );
      }
    }),
  );
  return { findings, ran };
}

// Ring 1 (domain) and ring 3 (application) files, per onion-architecture/SKILL.md.
const INNER_RING = /^(domain|helpers|status|cost|findings-summary|service|run-executor|findings)\.ts$|\.service\.ts$/;
const FORBIDDEN_IMPORTS = [
  ['critical', /^(fastify|@fastify\/.+|fastify\/.+)$/, 'Fastify stays at the edge (routes.ts, app.ts, platform/**)'],
  ['critical', /^drizzle-orm(\/.+)?$/, 'Drizzle stays in the repository'],
  ['critical', /(^|\/)db\/(schema|client)(\/.*|\.ts)?$/, 'db/schema and db/client are imported only by repositories and src/db/**'],
  ['critical', /^(octokit|@octokit\/.+|openai|@anthropic-ai\/sdk|simple-git)$/, 'SDKs stay in src/adapters/** behind a port'],
  ['high', /(^|\/)platform\/container(\.ts)?$/, 'New services get narrow port dependencies, not the whole Container'],
];

function onionLint(diff) {
  const findings = [];
  const files = diff.files.filter(
    (f) => f.status !== 'D' && /^server\/src\/modules\/.+\.ts$/.test(f.path) && !/\.test\.ts$/.test(f.path) && INNER_RING.test(path.basename(f.path)),
  );
  for (const f of files) {
    for (const { line, text } of addedLines(diff.base, f)) {
      const spec = text.match(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]/);
      if (!spec) continue;
      const target = spec[1] ?? spec[2] ?? spec[3];
      for (const [severity, re, rule] of FORBIDDEN_IMPORTS) {
        if (!re.test(target)) continue;
        findings.push(
          finding({
            source: 'onion-lint',
            severity,
            rule: `onion-architecture/${rule}`,
            file: f.path,
            line,
            evidence: `${path.basename(f.path)} is an inner-ring file but imports '${target}': \`${text.trim()}\``,
            fix: 'Move the dependency behind a port (repository/adapter) and inject it; see onion-architecture/SKILL.md.',
          }),
        );
      }
    }
  }
  return findings;
}

export async function checks(diff, opts) {
  const lint = onionLint(diff);
  const pkg = await packageChecks(diff, opts);
  return { ran: pkg.ran, findings: [...lint, ...pkg.findings] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const diff = collectDiff(args.base);
  const result = await checks(diff, { it: Boolean(args.it), tests: !args['no-tests'] });
  console.log(JSON.stringify({ fingerprint: diff.fingerprint, ...result }, null, 2));
}
