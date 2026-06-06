import { homedir } from 'node:os';
import { join } from 'node:path';

/** OS-appropriate cache root used when not inside a git repo. */
export function osCacheRoot(): string {
  if (process.platform === 'win32') {
    return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'clicksmith', 'Cache');
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Caches', 'clicksmith');
  }
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'clicksmith');
}

/**
 * The storage root for sessions/runs: the project's `.clicksmith/` when inside
 * a repo, otherwise the OS cache directory.
 */
export function resolveStorageRoot(repoRoot: string | null): string {
  return repoRoot ? join(repoRoot, '.clicksmith') : osCacheRoot();
}

/** Well-known sub-paths within a storage root. */
export function storagePaths(root: string) {
  return {
    root,
    sessions: join(root, 'sessions'),
    runs: join(root, 'runs'),
    screenshots: join(root, 'screenshots'),
    config: join(root, 'agents.config.json'),
    runDir: (runId: string) => join(root, 'runs', runId),
    sandboxDir: (runId: string) => join(root, 'worktrees', runId),
  };
}

export type StoragePaths = ReturnType<typeof storagePaths>;
