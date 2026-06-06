import { describe, expect, it } from 'vitest';
import { referencedPlaceholders, resolveCommand, resolvePlaceholders } from './placeholders.js';
import type { AgentLaunchContext } from './types.js';
import type { AgentConfig } from './config-schema.js';

const ctx: AgentLaunchContext = {
  bundlePath: '/repo/.clicksmith/runs/run_1/bundle.json',
  prompt: 'make #1 match #2',
  instructionFile: '/repo/CLAUDE.md',
  mode: 'plan',
  mcpServer: 'clicksmith',
  cwd: '/repo/.clicksmith/worktrees/run_1',
  isolation: 'worktree',
  agentId: 'claude',
};

describe('placeholder resolution', () => {
  it('replaces every known placeholder', () => {
    const out = resolvePlaceholders('{prompt} :: {bundlePath} :: {mode} :: {cwd} :: {mcpServer}', ctx);
    expect(out).toBe(
      'make #1 match #2 :: /repo/.clicksmith/runs/run_1/bundle.json :: plan :: /repo/.clicksmith/worktrees/run_1 :: clicksmith',
    );
  });

  it('leaves unknown placeholders untouched', () => {
    expect(resolvePlaceholders('{prompt} {unknown}', ctx)).toBe('make #1 match #2 {unknown}');
  });

  it('reports referenced placeholders', () => {
    expect(referencedPlaceholders('{prompt} {bundlePath} {nope}').sort()).toEqual([
      'bundlePath',
      'prompt',
    ]);
  });

  it('resolves a full command spec including env and cwd default', () => {
    const config: AgentConfig = {
      id: 'x',
      command: 'claude',
      args: ['-p', '{prompt}', '--file', '{instructionFile}'],
      env: { CS_BUNDLE: '{bundlePath}' },
    };
    const spec = resolveCommand(config, ctx);
    expect(spec.command).toBe('claude');
    expect(spec.args).toEqual(['-p', 'make #1 match #2', '--file', '/repo/CLAUDE.md']);
    expect(spec.env).toEqual({ CS_BUNDLE: '/repo/.clicksmith/runs/run_1/bundle.json' });
    expect(spec.cwd).toBe(ctx.cwd);
  });
});
