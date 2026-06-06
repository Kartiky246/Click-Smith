import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSession, appendElement } from '@clicksmith/core';
import { FileStore } from './store.js';
import { appContext, elementInput } from '../test/helpers.js';

let root: string;
let store: FileStore;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'clicksmith-store-'));
  store = new FileStore(root);
  await store.init();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('FileStore', () => {
  it('round-trips sessions', async () => {
    const session = createSession({ app: appContext('/a') });
    const { session: withEl } = appendElement(session, elementInput('/a', 'Buy', 10));
    await store.saveSession(withEl);
    const loaded = await store.getSession(withEl.id);
    expect(loaded?.elements).toHaveLength(1);
    expect(loaded?.elements[0]!.id).toBe(1);
  });

  it('lists and deletes sessions', async () => {
    const s = createSession({ app: appContext('/a') });
    await store.saveSession(s);
    expect(await store.listSessions()).toHaveLength(1);
    await store.deleteSession(s.id);
    expect(await store.listSessions()).toHaveLength(0);
  });

  it('cleans up expired, unsubmitted sessions only', async () => {
    const old = createSession({ app: appContext('/a'), now: new Date(Date.now() - 1000), ttlMs: 1 });
    const fresh = createSession({ app: appContext('/b'), ttlMs: 60_000 });
    const submitted = { ...createSession({ app: appContext('/c'), ttlMs: 1 }), status: 'submitted' as const };
    await store.saveSession(old);
    await store.saveSession(fresh);
    await store.saveSession(submitted);

    const removed = await store.cleanupExpired(new Date());
    expect(removed).toContain(old.id);
    expect(removed).not.toContain(fresh.id);
    expect(removed).not.toContain(submitted.id);
  });

  it('persists run records and artifacts, finding the latest', async () => {
    await store.saveRun({
      runId: 'run_a',
      sessionId: 's',
      agentId: 'fake',
      status: 'running',
      createdAt: '2026-06-07T10:00:00.000Z',
      updatedAt: '2026-06-07T10:00:00.000Z',
      mode: 'plan',
      isolation: 'worktree',
      prompt: 'p',
      repoRoot: null,
      baseCommit: null,
      baseBranch: null,
      sandbox: null,
      revert: null,
    });
    await store.writeArtifact('run_a', 'plan.md', '## Plan');
    expect((await store.getRun('run_a'))?.agentId).toBe('fake');
    expect(await store.readArtifact('run_a', 'plan.md')).toBe('## Plan');
    expect((await store.latestRun())?.runId).toBe('run_a');
  });

  it('appends to the agent log incrementally', async () => {
    await store.appendLog('run_b', 'line1\n');
    await store.appendLog('run_b', 'line2\n');
    expect(await store.readArtifact('run_b', 'agent.log')).toBe('line1\nline2\n');
  });
});
