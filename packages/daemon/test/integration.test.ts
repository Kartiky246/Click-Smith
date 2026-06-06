import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { execa } from 'execa';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RefusalError } from '../src/run-manager.js';
import {
  appContext,
  elementInput,
  eventTypes,
  makeService,
  makeTempRepo,
  waitFor,
  writeFakeAgentConfig,
} from './helpers.js';

let repo: { root: string; cleanup: () => Promise<void> };

afterEach(async () => {
  await repo?.cleanup();
});

describe('daemon end-to-end (plan + worktree)', () => {
  beforeEach(async () => {
    repo = await makeTempRepo();
    await writeFakeAgentConfig(repo.root, { targetFile: 'change.txt' });
  });

  it('captures across routes, submits, plans in a worktree, and applies', async () => {
    const { service, events } = await makeService(repo.root);

    // Capture #1 on /pricing, #2 on /home — same session persists across routes.
    const first = await service.capture({ app: appContext('/pricing'), element: elementInput('/pricing', 'Buy', 12) });
    const sessionId = first.sessionId;
    const second = await service.capture({
      sessionId,
      app: appContext('/home'),
      element: elementInput('/home', 'Start', 30),
    });
    expect(second.sessionId).toBe(sessionId);
    expect(first.element.id).toBe(1);
    expect(second.element.id).toBe(2);

    // Remove then re-add to exercise stable ids.
    await service.removeElement(sessionId, 2);
    const readd = await service.capture({ sessionId, app: appContext('/home'), element: elementInput('/home', 'Start', 30) });
    expect(readd.element.id).toBe(3); // never reuses #2

    // Submit in the default safe mode.
    const { runId, bundle } = await service.submit({ sessionId, prompt: 'make #1 match #3 style' });
    expect(bundle.execution).toEqual({ mode: 'plan', isolation: 'worktree', autoApply: false });

    // Wait for the agent to finish planning.
    await waitFor(() => events.some((e) => e.type === 'agent-done'));

    // The main working tree must be untouched before Apply.
    expect(existsSync(join(repo.root, 'change.txt'))).toBe(false);

    const planReady = events.find((e) => e.type === 'plan-ready');
    expect(planReady && 'diff' in planReady && planReady.diff).toContain('change.txt');

    // Event order: started → log(s) → plan-ready → done.
    const order = eventTypes(events);
    expect(order.indexOf('agent-started')).toBeLessThan(order.indexOf('plan-ready'));
    expect(order.indexOf('plan-ready')).toBeLessThan(order.indexOf('agent-done'));

    // Apply merges the sandbox back and cleans it up.
    const applied = await service.apply(runId);
    expect(applied.applied).toBe(true);
    expect(applied.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(await readFile(join(repo.root, 'change.txt'), 'utf8')).toMatch(/agent change/);

    await waitFor(() => events.some((e) => e.type === 'apply-done'));

    // The worktree directory is removed after a successful apply.
    const run = await service.store.getRun(runId);
    expect(run?.status).toBe('applied');
    expect(existsSync(run!.sandbox!.path)).toBe(false);
    expect(run?.revert?.previousHead).toMatch(/^[0-9a-f]{40}$/);
  });

  it('refuses a non-inplace run when the working tree is dirty', async () => {
    const { service } = await makeService(repo.root);
    await service.capture({ app: appContext('/x'), element: elementInput('/x', 'B', 1) });
    const session = (await service.store.listSessions())[0]!;

    await writeFile(join(repo.root, 'app.txt'), 'uncommitted edit\n');

    await expect(service.submit({ sessionId: session.id, prompt: 'do it' })).rejects.toBeInstanceOf(
      RefusalError,
    );
  });

  it('reports conflicts on apply and does not clean up', async () => {
    const { service, events } = await makeService(repo.root);
    await service.capture({ app: appContext('/x'), element: elementInput('/x', 'B', 1) });
    const session = (await service.store.listSessions())[0]!;
    const { runId } = await service.submit({ sessionId: session.id, prompt: 'edit change.txt' });
    await waitFor(() => events.some((e) => e.type === 'agent-done'));

    // Create a conflicting change.txt on the main branch before applying.
    await writeFile(join(repo.root, 'change.txt'), 'conflicting content\n');
    await execa('git', ['add', '-A'], { cwd: repo.root });
    await execa('git', ['commit', '-m', 'conflict'], { cwd: repo.root });

    const result = await service.apply(runId);
    expect(result.applied).toBe(false);
    expect(result.conflicts && result.conflicts.length).toBeGreaterThan(0);
    expect((await service.store.getRun(runId))?.status).toBe('apply-error');
  });
});

describe('daemon without a git repo', () => {
  it('falls back to inplace and still completes a run', async () => {
    // No repo: service uses OS cache + inplace isolation.
    const { mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const dir = await mkdtemp(join(tmpdir(), 'clicksmith-norepo-'));
    repo = { root: dir, cleanup: async () => {} };
    await writeFakeAgentConfig(dir);

    const { resolveDaemonConfig } = await import('../src/config.js');
    const { DaemonService } = await import('../src/daemon-service.js');
    const config = await resolveDaemonConfig({ cwd: dir, repoRoot: null, storageRoot: join(dir, '.clicksmith'), logLevel: 'silent' });
    const service = new DaemonService({ config, binExists: async () => true });
    await service.init();
    const events: string[] = [];
    service.bus.subscribe((e) => events.push(e.type));

    await service.capture({ app: appContext('/x'), element: elementInput('/x', 'B', 1) });
    const session = (await service.store.listSessions())[0]!;
    const { runId } = await service.submit({ sessionId: session.id, prompt: 'no repo run' });
    await waitFor(() => events.includes('agent-done') || events.includes('agent-error'));
    expect((await service.store.getRun(runId))?.isolation).toBe('inplace');
  });
});
