// Shared helpers for the pr-self-review scripts. Node >= 22, no dependencies.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const ROOT = git(['rev-parse', '--show-toplevel'], process.cwd()).trim();
export const SKILL_DIR = path.join(ROOT, '.claude/skills/pr-self-review');
export const CACHE_DIR = path.join(ROOT, '.devdigest/cache/pr-self-review');

export function git(args, cwd = ROOT) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function tryGit(args) {
  try {
    return git(args).trim();
  } catch {
    return null;
  }
}

/** Base ref: --base flag > PR_SELF_REVIEW_BASE > origin/main > main. */
export function resolveBaseRef(explicit) {
  const candidates = [explicit, process.env.PR_SELF_REVIEW_BASE, 'origin/main', 'main'].filter(Boolean);
  for (const ref of candidates) {
    if (tryGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])) return ref;
  }
  throw new Error(`none of the base refs exist: ${candidates.join(', ')}`);
}

// Never part of the diff at all (gitignored in practice, belt and braces).
const HARD_EXCLUDE = [/^server\/clones\//, /(^|\/)node_modules(\/|$)/, /(^|\/)(dist|\.next|build|coverage)\//];

// Changed, but not handed to reviewers or package checks. Diff rules still see them.
const REVIEW_EXCLUDE = [
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|skills-lock\.json)$/,
  /^server\/src\/db\/migrations\//,
];

/**
 * Everything that differs from merge-base(base, HEAD): commits, staged,
 * unstaged and untracked files. Working tree vs base, so committing does not
 * change the result — only editing content does.
 */
export function collectDiff(explicitBase) {
  const baseRef = resolveBaseRef(explicitBase);
  const base = git(['merge-base', baseRef, 'HEAD']).trim();
  const head = git(['rev-parse', 'HEAD']).trim();

  const files = new Map();
  const nameStatus = git(['diff', '--name-status', '--no-renames', '-z', base]).split('\0').filter(Boolean);
  for (let i = 0; i < nameStatus.length; i += 2) {
    files.set(nameStatus[i + 1], { path: nameStatus[i + 1], status: nameStatus[i][0] });
  }
  for (const p of git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)) {
    files.set(p, { path: p, status: 'A', untracked: true });
  }

  const all = [...files.values()]
    .filter((f) => !HARD_EXCLUDE.some((re) => re.test(f.path)))
    .sort((a, b) => a.path.localeCompare(b.path));

  // Fingerprint = content of every changed file, independent of commit/stage state.
  const h = createHash('sha256');
  for (const f of all) {
    const abs = path.join(ROOT, f.path);
    const content = f.status === 'D' || !existsSync(abs) ? 'DELETED' : statSync(abs).isFile() ? sha256(readFileSync(abs)) : 'NOT-A-FILE';
    h.update(`${f.path}\0${content}\n`);
  }

  return {
    baseRef,
    base,
    head,
    fingerprint: h.digest('hex').slice(0, 16),
    files: all,
    reviewFiles: all.filter((f) => f.status !== 'D' && !REVIEW_EXCLUDE.some((re) => re.test(f.path))),
  };
}

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** Added lines of one file vs base: [{ line, text }]. Untracked files count as fully added. */
export function addedLines(base, file) {
  const abs = path.join(ROOT, file.path);
  if (file.untracked) {
    if (!existsSync(abs) || !statSync(abs).isFile()) return [];
    return readFileSync(abs, 'utf8').split('\n').map((text, i) => ({ line: i + 1, text }));
  }
  const out = [];
  let line = 0;
  for (const raw of git(['diff', '-U0', '--no-color', base, '--', file.path]).split('\n')) {
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith('+') && !raw.startsWith('+++')) out.push({ line: line++, text: raw.slice(1) });
  }
  return out;
}

/** True when every added/removed line of a tracked file is blank or a comment. */
export function onlyCommentChanges(base, file) {
  if (file.untracked || file.status !== 'M') return false;
  const changed = git(['diff', '-U0', '--no-color', base, '--', file.path])
    .split('\n')
    .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l))
    .map((l) => l.slice(1).trim());
  return changed.every((l) => l === '' || /^(\/\/|\/\*|\*)/.test(l));
}

export function readText(rel) {
  const abs = path.join(ROOT, rel);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : '';
}

/** Minimal glob → RegExp: `**`, `*`, `?`, `{a,b}`. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') {
        i++;
        re += '(?:.*/)?';
      } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += `(?:${glob.slice(i + 1, end).split(',').map(escapeRe).join('|')})`;
      i = end;
    } else re += escapeRe(c);
  }
  return new RegExp(`^${re}$`);
}

function escapeRe(s) {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

export function finding(f) {
  const id = sha256(`${f.source}|${f.file ?? ''}|${f.line ?? ''}|${f.rule}`).slice(0, 8);
  return { id, verified: f.severity === 'critical', ...f };
}

export function writeJson(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) args._.push(a);
    else if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) args[a.slice(2)] = true;
    else args[a.slice(2)] = argv[++i];
  }
  return args;
}
