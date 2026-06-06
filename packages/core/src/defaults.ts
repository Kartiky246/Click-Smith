import type { ExecutionOptions } from './types.js';

/** Default localhost port the daemon listens on. */
export const DEFAULT_DAEMON_PORT = 8722;

/** Default localhost host. ClickSmith only ever binds loopback. */
export const DEFAULT_DAEMON_HOST = '127.0.0.1';

/** Default time-to-live for an unfinished capture session: 24 hours. */
export const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The immutable safe defaults: plan mode, worktree isolation, no auto-apply.
 * Any change away from these is considered a "risky option".
 */
export const DEFAULT_EXECUTION_OPTIONS: ExecutionOptions = {
  mode: 'plan',
  isolation: 'worktree',
  autoApply: false,
};

/**
 * Whether a set of execution options deviates from the safe defaults and
 * therefore requires explicit user confirmation in the extension/CLI:
 * non-plan mode, in-place isolation, or auto-apply.
 */
export function requiresConfirmation(execution: ExecutionOptions): boolean {
  return execution.mode !== 'plan' || execution.isolation === 'inplace' || execution.autoApply;
}

/** Human-readable reasons a given execution config is considered risky. */
export function confirmationReasons(execution: ExecutionOptions): string[] {
  const reasons: string[] = [];
  if (execution.mode !== 'plan') {
    reasons.push('Edit mode lets the agent modify files directly instead of only proposing a plan.');
  }
  if (execution.isolation === 'inplace') {
    reasons.push('In-place isolation runs against your working tree instead of a throwaway worktree.');
  }
  if (execution.autoApply) {
    reasons.push('Auto-apply merges the agent’s changes back without a manual review step.');
  }
  return reasons;
}
