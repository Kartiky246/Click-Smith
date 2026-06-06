import { describe, expect, it } from 'vitest';
import {
  applyManagedBlock,
  MANAGED_BEGIN,
  MANAGED_END,
  renderInstructions,
} from './renderers.js';

describe('instruction renderers', () => {
  it('renders the shared body for every target with the right native path', () => {
    expect(renderInstructions('claude').path).toBe('CLAUDE.md');
    expect(renderInstructions('codex').path).toBe('AGENTS.md');
    expect(renderInstructions('cursor').path).toBe('.cursor/rules/clicksmith.mdc');
    expect(renderInstructions('antigravity').path).toBe('.antigravity/rules/clicksmith.md');
    expect(renderInstructions('generic').path).toBe('.clicksmith/AGENT_INSTRUCTIONS.md');
  });

  it('teaches #N references, locator priority and safety in the body', () => {
    const { content } = renderInstructions('generic');
    expect(content).toMatch(/#N/);
    expect(content).toMatch(/source.*attr.*behavioral.*dom/s);
    expect(content).toMatch(/worktree/i);
    expect(content).toMatch(/Apply/);
  });

  it('cursor output carries MDC frontmatter', () => {
    const { content } = renderInstructions('cursor');
    expect(content.startsWith('---')).toBe(true);
    expect(content).toMatch(/alwaysApply: true/);
  });

  it('marks shared vs dedicated files', () => {
    expect(renderInstructions('claude').shared).toBe(true);
    expect(renderInstructions('cursor').shared).toBe(false);
  });
});

describe('managed block merging', () => {
  it('creates a block when there is no existing file', () => {
    const out = applyManagedBlock(undefined, 'hello');
    expect(out).toContain(MANAGED_BEGIN);
    expect(out).toContain('hello');
    expect(out).toContain(MANAGED_END);
  });

  it('appends a block while preserving existing content', () => {
    const out = applyManagedBlock('# My project rules\n\nKeep these.', 'CS body');
    expect(out).toMatch(/# My project rules/);
    expect(out).toMatch(/Keep these\./);
    expect(out).toContain('CS body');
  });

  it('replaces an existing block in place (idempotent updates)', () => {
    const first = applyManagedBlock('# Top\n', 'v1 body');
    const second = applyManagedBlock(first, 'v2 body');
    expect(second).toContain('v2 body');
    expect(second).not.toContain('v1 body');
    // user content above the block survives
    expect(second).toMatch(/# Top/);
    // exactly one managed block
    expect(second.split(MANAGED_BEGIN).length - 1).toBe(1);
  });
});
