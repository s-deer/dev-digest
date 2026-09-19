#!/usr/bin/env node
// Rules that look at the diff as a whole. No LLM, no package installs.
// Usage: node diff-rules.mjs [--base <ref>]
// Prints { fingerprint, findings[] }. Every finding here is critical and blocks.
import path from 'node:path';
import { addedLines, collectDiff, finding, onlyCommentChanges, parseArgs } from './lib.mjs';

const SCHEMA = /^server\/src\/db\/(schema\.ts|schema\/.+\.ts)$/;
const MIGRATION_SQL = /^server\/src\/db\/migrations\/[^/]+\.sql$/;
const SECRET_FILE = /(^|\/)(\.env(\.(?!example$|sample$|template$)[^/]+)?|secrets\.json)$/;
const SECRET_PATTERNS = [
  // Anthropic before OpenAI: `sk-ant-…` matches both, and only the first match per line counts.
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI key', /\bsk-(proj-)?[A-Za-z0-9_-]{20,}/],
  ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{40,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];
// Binary or generated files that would only produce noise in the secret scan.
const SKIP_SCAN = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip|gz)$|(^|\/)(pnpm-lock\.yaml|package-lock\.json)$/;

export function diffRules(diff) {
  const findings = [];
  const add = (f) => findings.push(finding({ source: 'diff-rules', severity: 'critical', ...f }));

  const schemaChanged = diff.files.filter((f) => SCHEMA.test(f.path) && !onlyCommentChanges(diff.base, f));
  const newMigrations = diff.files.filter((f) => MIGRATION_SQL.test(f.path) && f.status === 'A');
  if (schemaChanged.length && !newMigrations.length) {
    add({
      rule: 'migrations/schema-without-migration',
      file: schemaChanged[0].path,
      evidence: `Schema changed (${schemaChanged.map((f) => f.path).join(', ')}) but no new server/src/db/migrations/*.sql was added.`,
      fix: 'cd server && pnpm db:generate, then commit the generated migration.',
    });
  }

  for (const f of diff.files) {
    if (MIGRATION_SQL.test(f.path) && (f.status === 'M' || f.status === 'D')) {
      add({
        rule: 'migrations/edited-applied-migration',
        file: f.path,
        evidence: `Existing migration was ${f.status === 'M' ? 'modified' : 'deleted'}. Applied migrations must never be hand-edited (CLAUDE.md, "Do not touch").`,
        fix: `git checkout ${diff.base} -- ${f.path}; change src/db/schema.ts and run pnpm db:generate instead.`,
      });
    }
    if (f.path.startsWith('server/clones/')) {
      add({
        rule: 'clones/edited-cloned-repo',
        file: f.path,
        evidence: 'server/clones/** holds cloned user repos and must never be committed.',
        fix: 'Revert the change and unstage the file.',
      });
    }
    if (f.status !== 'D' && SECRET_FILE.test(path.basename(f.path))) {
      add({
        rule: 'secrets/secret-file',
        file: f.path,
        evidence: 'A secrets/env file is part of the diff. Secrets live in ~/.devdigest/secrets.json or process.env, never in git.',
        fix: 'Remove the file from the diff and add it to .gitignore.',
      });
    }
  }

  for (const f of diff.files) {
    if (f.status === 'D' || SKIP_SCAN.test(f.path)) continue;
    for (const { line, text } of addedLines(diff.base, f)) {
      const hit = SECRET_PATTERNS.find(([, re]) => re.test(text));
      if (hit) {
        const [label] = hit;
        add({
          rule: 'secrets/secret-in-diff',
          file: f.path,
          line,
          evidence: `Added line looks like a ${label}.`,
          fix: 'Remove it, rotate the credential, and load it from ~/.devdigest/secrets.json or process.env.',
        });
      }
    }
  }

  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const diff = collectDiff(args.base);
  console.log(JSON.stringify({ fingerprint: diff.fingerprint, findings: diffRules(diff) }, null, 2));
}
