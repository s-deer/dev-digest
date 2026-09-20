#!/usr/bin/env node
// Maps the reviewable files of the local diff to skills, using ../routing.md.
// Usage: node route.mjs [--base <ref>]
// Prints { baseRef, base, fingerprint, assignments: { skill: [files] }, unroutedFiles[], unroutedSkills[] }.
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, SKILL_DIR, collectDiff, globToRegExp, parseArgs, readText } from './lib.mjs';

function backticked(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1].replace(/\\\|/g, '|'));
}

export function parseRouting(md) {
  const section = md.split(/^## /m).find((s) => s.startsWith('Routes'));
  const rows = [];
  for (const line of section.split('\n')) {
    // split on pipes that are not escaped as \|
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
    if (cells.length !== 4 || cells[0] === 'Skill' || /^-+$/.test(cells[0])) continue;
    const [skill, include, exclude, content] = cells;
    const [contentRe] = backticked(content);
    rows.push({
      skill,
      include: backticked(include).map(globToRegExp),
      exclude: backticked(exclude).map(globToRegExp),
      content: contentRe ? new RegExp(contentRe, 'm') : null,
    });
  }
  const notReviewers = md
    .split(/^## /m)
    .find((s) => s.startsWith('Not reviewers'))
    .split('\n')
    .flatMap((l) => (l.match(/^- `([^`]+)`/) ? [l.match(/^- `([^`]+)`/)[1]] : []));
  return { rows, notReviewers };
}

export function route(diff) {
  const { rows, notReviewers } = parseRouting(readText(path.relative(ROOT, path.join(SKILL_DIR, 'routing.md'))));
  const assignments = {};
  const unroutedFiles = [];
  for (const { path: file } of diff.reviewFiles) {
    let hit = false;
    for (const row of rows) {
      if (!row.include.some((re) => re.test(file)) || row.exclude.some((re) => re.test(file))) continue;
      if (row.content && !row.content.test(readText(file))) continue;
      (assignments[row.skill] ??= new Set()).add(file);
      hit = true;
    }
    if (!hit) unroutedFiles.push(file);
  }

  const skillsRoot = path.join(ROOT, '.claude/skills');
  const onDisk = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(skillsRoot, d.name, 'SKILL.md')))
    .map((d) => d.name);
  const routed = new Set(rows.map((r) => r.skill));
  const missing = [...routed].filter((s) => !onDisk.includes(s));
  if (missing.length) throw new Error(`routing.md names skills that do not exist: ${missing.join(', ')}`);

  return {
    baseRef: diff.baseRef,
    base: diff.base,
    fingerprint: diff.fingerprint,
    assignments: Object.fromEntries(Object.entries(assignments).map(([s, f]) => [s, [...f].sort()])),
    unroutedFiles,
    unroutedSkills: onDisk.filter((s) => !routed.has(s) && !notReviewers.includes(s)),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify(route(collectDiff(args.base)), null, 2));
}
