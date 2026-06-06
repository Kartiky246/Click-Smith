import { execa } from 'execa';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Git } from './git.js';
import { makeTempRepo } from '../test/helpers.js';

let repo: { root: string; cleanup: () => Promise<void> };
let git: Git;

beforeEach(async () => {
  repo = await makeTempRepo();
  git = new Git(repo.root);
});

afterEach(async () => {
  await repo.cleanup();
});

describe('Git', () => {
  it('finds the repo root and head', async () => {
    // Compare canonical paths (macOS temp dirs are /var → /private/var symlinks).
    expect(await Git.findRepoRoot(repo.root)).toBe(await realpath(repo.root));
    expect(await git.headCommit()).toMatch(/^[0-9a-f]{40}$/);
    expect(await git.currentBranch()).toBe('main');
  });

  it('detects a clean vs dirty tree', async () => {
    expect(await git.isDirty()).toBe(false);
    await writeFile(join(repo.root, 'app.txt'), 'changed\n');
    expect(await git.isDirty()).toBe(true);
  });

  it('creates and removes a worktree on a fresh branch', async () => {
    const head = await git.headCommit();
    const path = join(repo.root, '..', `wt-${Date.now()}`);
    await git.createWorktree(path, 'clicksmith/test', head);
    expect(await readFile(join(path, 'app.txt'), 'utf8')).toBe('v1\n');
    await git.removeWorktree(path, 'clicksmith/test');
    const list = await execa('git', ['worktree', 'list'], { cwd: repo.root });
    expect(list.stdout).not.toContain('wt-');
  });

  it('captures a diff from a sandbox and applies it onto the main tree', async () => {
    const head = await git.headCommit();
    const path = join(repo.root, '..', `wt-apply-${Date.now()}`);
    await git.createWorktree(path, 'clicksmith/apply', head);
    await writeFile(join(path, 'new-file.txt'), 'hello\n');

    const diff = await Git.captureDiff(path);
    expect(diff).toContain('new-file.txt');

    const result = await git.applyPatch(diff);
    expect(result.ok).toBe(true);
    expect(await readFile(join(repo.root, 'new-file.txt'), 'utf8')).toBe('hello\n');

    await git.removeWorktree(path, 'clicksmith/apply');
  });

  it('reports conflicts when a patch does not apply cleanly', async () => {
    const head = await git.headCommit();
    const path = join(repo.root, '..', `wt-conflict-${Date.now()}`);
    await git.createWorktree(path, 'clicksmith/conflict', head);
    await writeFile(join(path, 'app.txt'), 'sandbox change\n');
    const diff = await Git.captureDiff(path);

    // Diverge the main tree so the 3-way apply conflicts.
    await writeFile(join(repo.root, 'app.txt'), 'main diverged\n');
    await execa('git', ['commit', '-am', 'diverge'], { cwd: repo.root });

    const result = await git.applyPatch(diff);
    expect(result.ok).toBe(false);

    await git.removeWorktree(path, 'clicksmith/conflict');
  });
});
