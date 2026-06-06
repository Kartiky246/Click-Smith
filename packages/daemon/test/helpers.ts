import { execa } from 'execa';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveDaemonConfig } from '../src/config.js';
import { DaemonService } from '../src/daemon-service.js';
import type { ServerEvent } from '@clicksmith/core';
import type { EventBus } from '../src/events.js';

export const FAKE_AGENT = fileURLToPath(new URL('./fixtures/fake-agent.mjs', import.meta.url));

/** Create a temp git repo with one committed file on `main`. */
export async function makeTempRepo(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'clicksmith-repo-'));
  const git = (...args: string[]) => execa('git', args, { cwd: root });
  await git('init', '-q');
  await git('config', 'user.email', 'test@clicksmith.dev');
  await git('config', 'user.name', 'ClickSmith Test');
  await git('config', 'commit.gpgsign', 'false');
  await writeFile(join(root, 'app.txt'), 'v1\n');
  // The installer gitignores ClickSmith's own state so it never dirties the tree.
  await writeFile(join(root, '.gitignore'), '.clicksmith/\nnode_modules/\n');
  await git('add', '-A');
  await git('commit', '-q', '-m', 'initial');
  await git('branch', '-M', 'main');
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

/** Write an `agents.config.json` wiring the fake agent into a repo's storage. */
export async function writeFakeAgentConfig(
  repoRoot: string,
  opts: { targetFile?: string; mode?: 'create' | 'append' } = {},
): Promise<void> {
  const dir = join(repoRoot, '.clicksmith');
  await mkdir(dir, { recursive: true });
  const args = [FAKE_AGENT, '{bundlePath}'];
  if (opts.targetFile) args.push(opts.targetFile);
  if (opts.mode) args.push(opts.mode);
  const config = {
    version: 1,
    defaultAgent: 'fake',
    agents: [{ id: 'fake', command: 'node', args, detect: { anyOf: ['node'] } }],
  };
  await writeFile(join(dir, 'agents.config.json'), JSON.stringify(config, null, 2));
}

/** Build a DaemonService bound to a repo, collecting every emitted event. */
export async function makeService(repoRoot: string): Promise<{
  service: DaemonService;
  events: ServerEvent[];
  bus: EventBus;
}> {
  const config = await resolveDaemonConfig({ cwd: repoRoot, repoRoot, logLevel: 'silent' });
  const service = new DaemonService({ config, binExists: async () => true });
  await service.init();
  const events: ServerEvent[] = [];
  service.bus.subscribe((e) => events.push(e));
  return { service, events, bus: service.bus };
}

/** Poll until `predicate` is true or `timeout` ms elapse. */
export async function waitFor(predicate: () => boolean, timeout = 10_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

export function eventTypes(events: ServerEvent[]): string[] {
  return events.map((e) => e.type);
}

/** A minimal valid captured-element input for a given route. */
export function elementInput(route: string, text: string, line: number) {
  return {
    ts: new Date().toISOString(),
    locator: { kind: 'source' as const, file: 'src/App.tsx', line },
    el: { tag: 'button', text, role: 'button', label: text, attrs: {} },
    near: { headings: [route] },
    conditions: { viewport: { w: 1280, h: 800 }, theme: 'light' as const },
  };
}

export function appContext(route: string) {
  return { url: `http://localhost:5173${route}`, route, page: route };
}

export { dirname, join };
