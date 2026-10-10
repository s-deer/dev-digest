import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { SimpleGitClient, parseLsTree } from '../src/adapters/git/simple-git.js';

/**
 * `SimpleGitClient.listTree` against a REAL temp git repo (no Docker, no
 * network): tracked files only, symlink mode surfaced, ignored/untracked files
 * absent. The clone dir layout is `<cloneDir>/<owner>/<name>`.
 */

const repo = { owner: 'acme', name: 'docs-fixture' };

describe('SimpleGitClient.listTree', () => {
  let cloneDir: string;
  let client: SimpleGitClient;
  let sha: string;

  beforeAll(async () => {
    cloneDir = await mkdtemp(join(tmpdir(), 'dd-list-tree-'));
    client = new SimpleGitClient(cloneDir);
    const dir = client.clonePathFor(repo);
    await mkdir(dir, { recursive: true });
    const git = simpleGit(dir);
    await git.init();
    await git.addConfig('user.email', 't@example.com');
    await git.addConfig('user.name', 'Test');
    await git.addConfig('commit.gpgsign', 'false');

    await mkdir(join(dir, 'docs'), { recursive: true });
    await mkdir(join(dir, '.devdigest', 'specs'), { recursive: true });
    await mkdir(join(dir, 'node_modules', 'pkg', 'docs'), { recursive: true });
    await writeFile(join(dir, 'docs', 'a.md'), '# A\n');
    await writeFile(join(dir, 'docs', 'with space.md'), '# Space\n');
    await writeFile(join(dir, '.devdigest', 'specs', 'b.md'), '# B\n');
    await writeFile(join(dir, '.gitignore'), 'node_modules/\n');
    await symlink('a.md', join(dir, 'docs', 'link.md'));
    await git.add(['.gitignore', 'docs', '.devdigest']);
    await git.commit('init');
    // Untracked + ignored files are NOT in the tree.
    await writeFile(join(dir, 'docs', 'untracked.md'), '# untracked\n');
    await writeFile(join(dir, 'node_modules', 'pkg', 'docs', 'a.md'), '# dep\n');
    sha = (await git.revparse(['HEAD'])).trim();
  });

  afterAll(async () => {
    await rm(cloneDir, { recursive: true, force: true });
  });

  it('lists tracked blobs only and reports the symlink mode', async () => {
    const tree = await client.listTree(repo, sha);
    const byPath = new Map(tree.map((e) => [e.path, e]));

    expect([...byPath.keys()].sort()).toEqual(
      ['.devdigest/specs/b.md', '.gitignore', 'docs/a.md', 'docs/link.md', 'docs/with space.md'].sort(),
    );
    expect(byPath.get('docs/a.md')).toMatchObject({ mode: '100644', size: 4 });
    expect(byPath.get('docs/a.md')!.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(byPath.get('docs/link.md')!.mode).toBe('120000');
    expect(byPath.has('docs/untracked.md')).toBe(false);
    expect([...byPath.keys()].some((p) => p.startsWith('node_modules/'))).toBe(false);
  });

  it('rejects a non-hex ref before reaching git', async () => {
    await expect(client.listTree(repo, '--output=/tmp/x')).rejects.toThrow(/hex SHA/);
  });

  it('rejects when the clone is missing', async () => {
    await expect(client.listTree({ owner: 'acme', name: 'nope' }, sha)).rejects.toThrow();
  });
});

describe('parseLsTree', () => {
  it('parses padded sizes, submodule "-" sizes and tab-bearing paths; skips trees', () => {
    const raw = [
      '100644 blob aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa      12\tdocs/a.md',
      '120000 blob bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb       3\tdocs/l.md',
      '160000 commit cccccccccccccccccccccccccccccccccccccccc       -\tvendor/sub',
      '100644 blob dddddddddddddddddddddddddddddddddddddddd       1\tdocs/we\tird.md',
      '040000 tree eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee       -\tdocs',
      '',
    ].join('\0');
    const out = parseLsTree(raw);
    expect(out.map((e) => [e.path, e.mode, e.size])).toEqual([
      ['docs/a.md', '100644', 12],
      ['docs/l.md', '120000', 3],
      ['vendor/sub', '160000', 0],
      ['docs/we\tird.md', '100644', 1],
    ]);
  });
});
