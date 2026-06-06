import type {
  CaptureBundle,
  ExecutionMode,
  Isolation,
  RunStatus,
  SandboxInfo,
} from '@clicksmith/core';

/** Metadata enabling a run to be reverted after apply. */
export interface RevertMeta {
  /** The repo HEAD before applying this run. */
  previousHead: string;
  /** The commit created by applying, if any. */
  appliedCommit?: string;
  /** Human-readable revert instructions. */
  instructions: string;
}

/** A persisted run record (`runs/<runId>/run.json`). */
export interface RunRecord {
  runId: string;
  sessionId: string;
  agentId: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  mode: ExecutionMode;
  isolation: Isolation;
  prompt: string;
  repoRoot: string | null;
  baseCommit: string | null;
  /** The branch HEAD was on at prepare time (for branch-isolation apply). */
  baseBranch: string | null;
  sandbox: SandboxInfo | null;
  revert: RevertMeta | null;
  exitCode?: number;
  error?: string;
  hasPlan?: boolean;
  hasDiff?: boolean;
  applied?: { commit?: string; at: string };
}

export interface RunArtifacts {
  bundle: CaptureBundle;
  plan?: string;
  diff?: string;
  log?: string;
}
