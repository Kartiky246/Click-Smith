import { describe, expect, it } from 'vitest';
import {
  confirmationReasons,
  DEFAULT_EXECUTION_OPTIONS,
  requiresConfirmation,
} from './defaults.js';
import type { ExecutionOptions } from './types.js';

describe('execution defaults & confirmation gating', () => {
  it('safe defaults are plan + worktree + no auto-apply', () => {
    expect(DEFAULT_EXECUTION_OPTIONS).toEqual({
      mode: 'plan',
      isolation: 'worktree',
      autoApply: false,
    });
  });

  it('safe defaults need no confirmation', () => {
    expect(requiresConfirmation(DEFAULT_EXECUTION_OPTIONS)).toBe(false);
    expect(confirmationReasons(DEFAULT_EXECUTION_OPTIONS)).toEqual([]);
  });

  it.each<[string, ExecutionOptions]>([
    ['edit mode', { mode: 'edit', isolation: 'worktree', autoApply: false }],
    ['inplace isolation', { mode: 'plan', isolation: 'inplace', autoApply: false }],
    ['auto-apply', { mode: 'plan', isolation: 'worktree', autoApply: true }],
  ])('requires confirmation for %s', (_label, opts) => {
    expect(requiresConfirmation(opts)).toBe(true);
    expect(confirmationReasons(opts).length).toBeGreaterThan(0);
  });

  it('lists every risky reason when all are set', () => {
    const opts: ExecutionOptions = { mode: 'edit', isolation: 'inplace', autoApply: true };
    expect(confirmationReasons(opts)).toHaveLength(3);
  });
});
