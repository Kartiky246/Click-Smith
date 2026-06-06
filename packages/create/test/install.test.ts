import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseAgentsConfig } from '@clicksmith/agent-config';
import { detectProject } from '../src/detect.js';
import { applyPlan, planInstall } from '../src/install.js';

let root: string;

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function scaffold(files: Record<string, string>): Promise<void> {
  root = await mkdtemp(join(tmpdir(), 'clicksmith-proj-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
}

const read = (p: string) => readFile(join(root, p), 'utf8');

describe('installer — Vite + React project', () => {
  beforeEach(async () => {
    await scaffold({
      'package.json': JSON.stringify({
        name: 'demo',
        devDependencies: { vite: '^5.0.0', react: '^18.0.0', '@vitejs/plugin-react': '^4.0.0' },
      }),
      'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
      'vite.config.ts': `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n});\n`,
      'src/App.tsx': `export default function App() {\n  return <button data-testid="cta">Buy</button>;\n}\n`,
      'CLAUDE.md': '# Project rules\n\nBe nice.\n',
      '.gitignore': 'node_modules\n',
    });
  });

  it('detects the stack', async () => {
    const info = await detectProject(root);
    expect(info.packageManager).toBe('pnpm');
    expect(info.bundler).toBe('vite');
    expect(info.framework).toBe('react');
    expect(info.stableAttrs).toContain('data-testid');
    expect(info.supportsUnplugin).toBe(true);
    expect(info.viteConfig).toBe('vite.config.ts');
  });

  it('writes instructions, config, MCP registration and wires vite — preserving user files', async () => {
    const info = await detectProject(root);
    const plan = await planInstall(info);
    await applyPlan(root, plan);

    // CLAUDE.md keeps the user's content and gains a managed block.
    const claude = await read('CLAUDE.md');
    expect(claude).toMatch(/# Project rules/);
    expect(claude).toMatch(/Be nice\./);
    expect(claude).toMatch(/BEGIN CLICKSMITH/);
    expect(claude).toMatch(/source.*attr.*behavioral.*dom/s);
    // stable attrs are surfaced to the agent
    expect(claude).toMatch(/data-testid/);

    // agents.config.json is valid but does not freeze built-in command defaults.
    const config = parseAgentsConfig(JSON.parse(await read('.clicksmith/agents.config.json')));
    expect(config.ok).toBe(true);
    if (config.ok) {
      expect(config.config.defaultAgent).toBe('claude');
      expect(config.config.agents).toEqual([]);
    }

    // MCP server registered for Claude (.mcp.json) and Cursor (.cursor/mcp.json).
    const mcp = JSON.parse(await read('.mcp.json'));
    expect(mcp.mcpServers.clicksmith.args).toContain('mcp');
    const cursorMcp = JSON.parse(await read('.cursor/mcp.json'));
    expect(cursorMcp.mcpServers.clicksmith).toBeTruthy();

    // Vite config wired with the unplugin, first in the plugins array.
    const vite = await read('vite.config.ts');
    expect(vite).toMatch(/@clicksmith\/unplugin\/vite/);
    expect(vite).toMatch(/plugins:\s*\[\s*clicksmith\(\),\s*react\(\)/);

    // package.json gains the dependencies but keeps existing ones.
    const pkg = JSON.parse(await read('package.json'));
    expect(pkg.devDependencies.vite).toBe('^5.0.0');
    expect(pkg.devDependencies['@clicksmith/daemon']).toBeTruthy();
    expect(pkg.devDependencies['@clicksmith/unplugin']).toBeTruthy();

    // .gitignore gains .clicksmith/ without losing node_modules.
    const gi = await read('.gitignore');
    expect(gi).toMatch(/node_modules/);
    expect(gi).toMatch(/\.clicksmith\//);
  });

  it('is idempotent — re-running does not duplicate managed blocks or wiring', async () => {
    const info = await detectProject(root);
    await applyPlan(root, await planInstall(info));
    const info2 = await detectProject(root);
    await applyPlan(root, await planInstall(info2));

    const claude = await read('CLAUDE.md');
    expect(claude.split('BEGIN CLICKSMITH').length - 1).toBe(1);
    const vite = await read('vite.config.ts');
    expect(vite.split('@clicksmith/unplugin').length - 1).toBe(1);
  });
});

describe('installer — stable-attr-only project (no unplugin)', () => {
  beforeEach(async () => {
    await scaffold({
      'package.json': JSON.stringify({ name: 'legacy', dependencies: { jquery: '^3.0.0' } }),
      'package-lock.json': '{}',
      'src/index.js': `document.querySelector('[data-qa="x"]');\n`,
    });
  });

  it('detects no unplugin support and recommends attribute fallback', async () => {
    const info = await detectProject(root);
    expect(info.supportsUnplugin).toBe(false);
    expect(info.packageManager).toBe('npm');
    expect(info.stableAttrs).toContain('data-qa');

    const plan = await planInstall(info);
    await applyPlan(root, plan);

    // Still writes instructions + MCP config, no vite wiring.
    expect(await read('AGENTS.md')).toMatch(/source.*attr.*behavioral.*dom/s);
    expect(JSON.parse(await read('.mcp.json')).mcpServers.clicksmith).toBeTruthy();
    expect(plan.messages.join('\n')).toMatch(/fallback locator/i);
  });
});
