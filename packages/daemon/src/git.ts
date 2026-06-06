import { execa } from 'execa';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Isolation, SandboxInfo } from '@clicksmith/core';

export class GitError extends Error {}

/** Thin wrapper around the `git` CLI, scoped to a working directory. */
export class Git {
  constructor(private readonly cwd: string) {}

  private async run(args: string[], opts: { reject?: boolean } = {}) {
    const result = await execa('git', args, { cwd: this.cwd, reject: false });
    if (opts.reject !== false && result.exitCode !== 0) {
      throw new GitError(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
    }
    return result;
  }

  /** Absolute repo root, or `null` if `cwd` is not inside a git repo. */
  static async findRepoRoot(cwd: string): Promise<string | null> {
    const result = await execa('git', ['rev-parse', '--show-toplevel'], { cwd, reject: false });
    return result.exitCode === 0 ? result.stdout.trim() : null;
  }

  async headCommit(): Promise<string> {
    return (await this.run(['rev-parse', 'HEAD'])).stdout.trim();
  }

  async currentBranch(): Promise<string> {
    return (await this.run(['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
  }

  /**
   * Whether the working tree has uncommitted (tracked or untracked) changes,
   * ignoring any paths under `exclude` prefixes (e.g. ClickSmith's own
   * `.clicksmith/` state directory).
   */
  async isDirty(opts: { exclude?: string[] } = {}): Promise<boolean> {
    const result = await this.run(['status', '--porcelain']);
    const exclude = opts.exclude ?? [];
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .some((line) => {
        const path = line.slice(2).trim();
        const actual = path.includes(' -> ') ? path.split(' -> ')[1]! : path;
        return !exclude.some((prefix) => actual.startsWith(prefix));
      });
  }

  /** Whether this git supports worktrees (>= 2.5). */
  async supportsWorktree(): Promise<boolean> {
    const result = await execa('git', ['worktree', 'list'], { cwd: this.cwd, reject: false });
    return result.exitCode === 0;
  }

  /**
   * Create a throwaway worktree on a fresh branch for a run. The worktree lives
   * outside the main tree so the agent's edits never touch it.
   */
  async createWorktree(path: string, branch: string, baseRef: string): Promise<void> {
    await this.run(['worktree', 'add', '-b', branch, path, baseRef]);
  }

  async removeWorktree(path: string, branch?: string): Promise<void> {
    await this.run(['worktree', 'remove', '--force', path], { reject: false });
    if (branch) await this.run(['branch', '-D', branch], { reject: false });
  }

  /** Create + checkout a dedicated branch (the worktree fallback). */
  async createBranch(branch: string, baseRef: string): Promise<void> {
    await this.run(['switch', '-c', branch, baseRef]);
  }

  async switchTo(ref: string): Promise<void> {
    await this.run(['switch', ref]);
  }

  async deleteBranch(branch: string): Promise<void> {
    await this.run(['branch', '-D', branch], { reject: false });
  }

  /**
   * Capture every change in a sandbox (relative to its HEAD) as a single
   * binary-safe patch, including new and deleted files. Returns '' if clean.
   */
  static async captureDiff(sandboxPath: string): Promise<string> {
    await execa('git', ['add', '-A'], { cwd: sandboxPath, reject: false });
    const result = await execa('git', ['diff', '--cached', '--binary'], {
      cwd: sandboxPath,
      reject: false,
    });
    return result.exitCode === 0 ? result.stdout : '';
  }

  /**
   * Apply a captured patch onto the main working tree using a 3-way merge,
   * staging the result. Returns the list of conflicted files (empty on success).
   */
  async applyPatch(patch: string): Promise<{ ok: boolean; conflicts: string[] }> {
    if (!patch.trim()) return { ok: true, conflicts: [] };
    const tmp = await mkdtemp(join(tmpdir(), 'clicksmith-patch-'));
    const patchFile = join(tmp, 'run.patch');
    try {
      await writeFile(patchFile, patch.endsWith('\n') ? patch : `${patch}\n`, 'utf8');
      const result = await this.run(['apply', '--index', '--3way', patchFile], { reject: false });
      if (result.exitCode === 0) return { ok: true, conflicts: [] };
      const unmerged = (await this.run(['diff', '--name-only', '--diff-filter=U'], { reject: false }))
        .stdout.split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const conflicts = [...new Set([...unmerged, ...parseConflicts(result.stderr)])];
      return { ok: false, conflicts: conflicts.length ? conflicts : ['(unresolved — see git status)'] };
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  /** Commit the currently staged changes; returns the new commit sha. */
  async commit(message: string): Promise<string> {
    await this.run(['commit', '-m', message, '--no-verify']);
    return this.headCommit();
  }

  /** Whether there is anything staged or unstaged to commit. */
  async hasChanges(): Promise<boolean> {
    return this.isDirty();
  }

  /**
   * Merge a branch into the current branch with `--no-ff`. On conflict, the
   * merge is aborted and the conflicted files are returned.
   */
  async merge(branch: string, message: string): Promise<{ ok: boolean; conflicts: string[] }> {
    const result = await this.run(['merge', '--no-ff', '-m', message, branch], { reject: false });
    if (result.exitCode === 0) return { ok: true, conflicts: [] };
    const conflicts = (await this.run(['diff', '--name-only', '--diff-filter=U'], { reject: false }))
      .stdout.split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    await this.run(['merge', '--abort'], { reject: false });
    return { ok: false, conflicts };
  }

  async resetHard(ref: string): Promise<void> {
    await this.run(['reset', '--hard', ref]);
  }
}

function parseConflicts(stderr: string): string[] {
  const files = new Set<string>();
  for (const line of stderr.split(/\r?\n/)) {
    // `error: <path>: already exists in working directory`
    const errColon = line.match(/^error:\s*(.+?):\s/);
    if (errColon?.[1]) files.add(errColon[1].trim());
    // Quoted paths, e.g. `Applied patch to 'foo.ts' with conflicts.`
    for (const q of line.matchAll(/'([^']+)'/g)) files.add(q[1]!.trim());
    // Porcelain unmerged lines.
    const u = line.match(/^U\s+(.+)$/);
    if (u?.[1]) files.add(u[1].trim());
  }
  return [...files];
}

/** Build the sandbox descriptor for a prepared run. */
export function describeSandbox(
  isolation: Isolation,
  path: string,
  branch: string | null,
  baseCommit: string,
): SandboxInfo {
  return { isolation, path, branch, baseCommit };
}
