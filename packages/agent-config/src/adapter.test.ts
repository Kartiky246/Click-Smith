import { describe, expect, it } from 'vitest';
import { buildAdapters, configToAdapter } from './adapter.js';
import { DEFAULT_AGENTS } from './defaults.js';
import { mergeAgentsConfig, resolveAgent } from './merge.js';
import { AgentsConfigSchema } from './config-schema.js';
import type { AgentLaunchContext } from './types.js';

const ctx: AgentLaunchContext = {
  bundlePath: '/b.json',
  prompt: 'do it',
  agentPrompt: 'ClickSmith request\ndo it',
  instructionFile: '/CLAUDE.md',
  mode: 'plan',
  mcpServer: 'clicksmith',
  cwd: '/sandbox',
  isolation: 'worktree',
  agentId: 'claude',
  binExists: async (bin) => bin === 'claude',
};

describe('configToAdapter', () => {
  const claude = DEFAULT_AGENTS.find((a) => a.id === 'claude')!;

  it('is available when a detect bin resolves', async () => {
    const adapter = configToAdapter(claude);
    expect(await adapter.isAvailable(ctx)).toBe(true);
  });

  it('is unavailable when no detect bin resolves', async () => {
    const adapter = configToAdapter({ ...claude, detect: { anyOf: ['nope-cli'] } });
    expect(await adapter.isAvailable(ctx)).toBe(false);
  });

  it('builds a concrete command from the template', () => {
    const spec = configToAdapter(claude).buildCommand(ctx);
    expect(spec.command).toBe('claude');
    expect(spec.args).toContain('ClickSmith request\ndo it');
    expect(spec.args).toContain('@/CLAUDE.md');
  });

  it('launches Codex with fast per-run reasoning defaults', () => {
    const codex = DEFAULT_AGENTS.find((a) => a.id === 'codex')!;
    const spec = configToAdapter(codex).buildCommand({ ...ctx, agentId: 'codex' });
    expect(spec.args).toContain('--ephemeral');
    expect(spec.args).toContain('model_reasoning_effort="low"');
  });

  it('parses plan-ready and error events from config regexes', () => {
    const adapter = configToAdapter(claude);
    const events = adapter.parseEvents!('## Plan\nerror: boom\n', ctx);
    expect(events.some((e) => e.type === 'plan-ready')).toBe(true);
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });
});

describe('config merge & resolution', () => {
  it('overlays replace agents by id and can add new ones', () => {
    const base = AgentsConfigSchema.parse({ agents: DEFAULT_AGENTS, defaultAgent: 'claude' });
    const overlay = AgentsConfigSchema.parse({
      defaultAgent: 'fake',
      agents: [
        { id: 'claude', command: 'claude', args: ['--custom'] },
        { id: 'fake', command: 'node', args: ['fake.js'] },
      ],
    });
    const merged = mergeAgentsConfig(base, overlay);
    expect(merged.defaultAgent).toBe('fake');
    expect(merged.agents.find((a) => a.id === 'claude')!.args).toEqual(['--custom']);
    expect(merged.agents.find((a) => a.id === 'fake')).toBeDefined();
  });

  it('resolves the effective agent (explicit → default → first)', () => {
    const config = AgentsConfigSchema.parse({ agents: DEFAULT_AGENTS, defaultAgent: 'codex' });
    expect(resolveAgent(config, 'cursor')?.id).toBe('cursor');
    expect(resolveAgent(config)?.id).toBe('codex');
    expect(resolveAgent({ version: 1, agents: DEFAULT_AGENTS })?.id).toBe('claude');
  });

  it('builds an adapter map keyed by id for all defaults', () => {
    const map = buildAdapters(DEFAULT_AGENTS);
    expect([...map.keys()].sort()).toEqual(['antigravity', 'claude', 'codex', 'cursor', 'generic']);
  });
});
