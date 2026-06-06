import { describe, expect, it } from 'vitest';
import { CaptureBundleSchema, type CaptureBundle, type Session } from '@clicksmith/core';
import { callTool, TOOL_DEFINITIONS, type McpReader } from './mcp-tools.js';

const bundle: CaptureBundle = CaptureBundleSchema.parse({
  v: 5,
  sessionId: 'cs_1',
  submittedAt: '2026-06-07T10:00:00.000Z',
  prompt: 'make #1 match #2',
  app: { url: 'http://localhost/x', route: '/x', page: 'X' },
  execution: { mode: 'plan', isolation: 'worktree', autoApply: false },
  elements: [
    {
      id: 1,
      ts: '2026-06-07T10:00:00.000Z',
      locator: { kind: 'source', file: 'a.tsx', line: 1 },
      el: { tag: 'button', text: 'A', attrs: {} },
      near: {},
      conditions: { viewport: { w: 100, h: 100 } },
    },
    {
      id: 2,
      ts: '2026-06-07T10:00:00.000Z',
      locator: { kind: 'attr', attr: 'data-testid', value: 'b', selector: '[data-testid="b"]' },
      el: { tag: 'button', text: 'B', attrs: {} },
      near: {},
      conditions: { viewport: { w: 100, h: 100 } },
    },
  ],
});

const session: Session = {
  id: 'cs_1',
  createdAt: '2026-06-07T10:00:00.000Z',
  updatedAt: '2026-06-07T10:00:00.000Z',
  expiresAt: '2026-06-08T10:00:00.000Z',
  status: 'submitted',
  app: bundle.app,
  elements: bundle.elements,
  lastElementId: 2,
};

const reader: McpReader = {
  getSession: async (id) => (id === 'cs_1' ? session : undefined),
  latestBundle: async () => bundle,
};

describe('MCP tools', () => {
  it('exposes exactly the four read-only tools', () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name).sort()).toEqual([
      'get_element_by_id',
      'get_latest_request',
      'get_session',
      'list_elements',
    ]);
  });

  it('tool descriptions teach #N, locator priority and safety', () => {
    const all = TOOL_DEFINITIONS.map((t) => t.description).join('\n');
    expect(all).toMatch(/#1|#N/);
    expect(all).toMatch(/source.*attr.*behavioral.*dom/s);
    expect(all).toMatch(/worktree|Apply/);
  });

  it('get_latest_request returns the latest bundle', async () => {
    const result = await callTool('get_latest_request', {}, reader);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain('make #1 match #2');
  });

  it('get_session resolves a known session and errors on unknown', async () => {
    expect((await callTool('get_session', { sessionId: 'cs_1' }, reader)).ok).toBe(true);
    const missing = await callTool('get_session', { sessionId: 'nope' }, reader);
    expect(missing.ok).toBe(false);
  });

  it('list_elements falls back to the latest request', async () => {
    const result = await callTool('list_elements', {}, reader);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const arr = JSON.parse(result.text);
      expect(arr).toHaveLength(2);
    }
  });

  it('get_element_by_id resolves #N', async () => {
    const r = await callTool('get_element_by_id', { id: 2 }, reader);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain('data-testid');
    const missing = await callTool('get_element_by_id', { id: 99 }, reader);
    expect(missing.ok).toBe(false);
  });
});
