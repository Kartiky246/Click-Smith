import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  applyManagedBlock,
  DEFAULT_AGENTS_CONFIG,
  parseAgentsConfig,
  renderInstructions,
  type InstructionTarget,
} from '@clicksmith/agent-config';
import { DEFAULT_DAEMON_PORT } from '@clicksmith/core';
import type { PackageManager, ProjectInfo } from './detect.js';

export interface InstallOptions {
  /** Which agents to render instruction files for. */
  agents?: InstructionTarget[];
  /** Wire the dev-only data-loc unplugin. Defaults to detection. */
  useUnplugin?: boolean;
  daemonPort?: number;
}

export interface FileChange {
  path: string;
  action: 'create' | 'merge' | 'skip';
  contents: string;
  reason?: string;
}

export interface InstallPlan {
  changes: FileChange[];
  messages: string[];
  nextSteps: string[];
}

const DEFAULT_AGENT_TARGETS: InstructionTarget[] = ['claude', 'cursor', 'codex', 'generic'];

/**
 * Compute every file change needed to install ClickSmith into a project,
 * reading existing files so merges preserve user content. Nothing is written —
 * call {@link applyPlan} for that. This split keeps the installer fully testable.
 */
export async function planInstall(
  info: ProjectInfo,
  options: InstallOptions = {},
): Promise<InstallPlan> {
  const root = info.root;
  const targets = options.agents ?? DEFAULT_AGENT_TARGETS;
  const useUnplugin = options.useUnplugin ?? info.supportsUnplugin;
  const port = options.daemonPort ?? DEFAULT_DAEMON_PORT;

  const changes: FileChange[] = [];
  const messages: string[] = [];
  const nextSteps: string[] = [];

  // 1. Agent instruction files (managed blocks preserve user content).
  for (const target of targets) {
    const rendered = renderInstructions(target, {
      stableAttrs: info.stableAttrs,
      daemonPort: port,
    });
    const existing = await readText(join(root, rendered.path));
    const contents = rendered.shared
      ? applyManagedBlock(existing, rendered.content)
      : rendered.content;
    changes.push({
      path: rendered.path,
      action: existing == null ? 'create' : 'merge',
      contents,
    });
  }

  // 2. agents.config.json — keep this as user overrides only. The daemon ships
  // built-in defaults, so copying them into projects would freeze old commands.
  const configPath = join('.clicksmith', 'agents.config.json');
  const existingConfigRaw = await readText(join(root, configPath));
  if (existingConfigRaw == null) {
    changes.push({
      path: configPath,
      action: 'create',
      contents: `${JSON.stringify(
        { version: 1, defaultAgent: DEFAULT_AGENTS_CONFIG.defaultAgent, agents: [] },
        null,
        2,
      )}\n`,
    });
  } else {
    try {
      const parsed = parseAgentsConfig(JSON.parse(existingConfigRaw));
      if (!parsed.ok) {
        messages.push('Existing agents.config.json was invalid; left it untouched.');
      }
    } catch {
      messages.push('Existing agents.config.json was invalid JSON; left it untouched.');
    }
    changes.push({
      path: configPath,
      action: 'skip',
      contents: existingConfigRaw,
      reason: 'existing user agent overrides preserved',
    });
  }

  // 3. MCP registration for the daemon's stdio server.
  const mcp = mcpCommand(info.packageManager);
  changes.push(await mcpChange(root, '.mcp.json', mcp));
  if (targets.includes('cursor')) {
    changes.push(await mcpChange(root, join('.cursor', 'mcp.json'), mcp));
  }

  // 4. Wire the data-loc unplugin (best effort) + record the dependency.
  if (useUnplugin && info.viteConfig) {
    const wired = await wireViteConfig(root, info.viteConfig);
    if (wired) changes.push(wired);
    else
      messages.push(
        `Could not automatically wire ${info.viteConfig}. Add: import clicksmith from '@clicksmith/unplugin/vite'; and put clicksmith() first in plugins.`,
      );
  } else if (useUnplugin) {
    messages.push(
      'No Vite config found — add the @clicksmith/unplugin plugin to your bundler manually.',
    );
  } else {
    messages.push(
      `Stable source locators via unplugin aren't available for this stack; ClickSmith will use ${
        info.stableAttrs.length
          ? `your attributes (${info.stableAttrs.join(', ')})`
          : 'attribute/behavioral/DOM'
      } as the fallback locator (source → attr → behavioral → dom).`,
    );
  }

  // 5. package.json — add the dependencies needed for the bin + plugin.
  changes.push(await packageJsonChange(root, useUnplugin));

  // 6. Ensure .clicksmith/ is gitignored.
  changes.push(await gitignoreChange(root));

  nextSteps.push(
    `${installCmd(info.packageManager)}   # install the new dependencies`,
    `${runCmd(info.packageManager, 'clicksmith daemon')}   # start the localhost daemon`,
    `${runCmd(info.packageManager, 'clicksmith doctor')}   # verify agent CLIs are visible to the daemon`,
    'Install the ClickSmith browser extension, toggle AI Mode, and Alt+Click an element.',
  );

  return { changes, messages, nextSteps };
}

/** Apply a plan to disk, writing create/merge changes and skipping the rest. */
export async function applyPlan(root: string, plan: InstallPlan): Promise<FileChange[]> {
  const written: FileChange[] = [];
  for (const change of plan.changes) {
    if (change.action === 'skip') continue;
    const full = join(root, change.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, change.contents, 'utf8');
    written.push(change);
  }
  return written;
}

/* ------------------------------- helpers ---------------------------------- */

interface McpServerSpec {
  command: string;
  args: string[];
}

function mcpCommand(pm: PackageManager): McpServerSpec {
  switch (pm) {
    case 'pnpm':
      return { command: 'pnpm', args: ['exec', 'clicksmith', 'mcp'] };
    case 'yarn':
      return { command: 'yarn', args: ['clicksmith', 'mcp'] };
    case 'bun':
      return { command: 'bunx', args: ['clicksmith', 'mcp'] };
    case 'npm':
      return { command: 'npx', args: ['clicksmith', 'mcp'] };
  }
}

async function mcpChange(root: string, path: string, spec: McpServerSpec): Promise<FileChange> {
  const existingRaw = await readText(join(root, path));
  let doc: { mcpServers?: Record<string, unknown> } = {};
  if (existingRaw) {
    try {
      doc = JSON.parse(existingRaw);
    } catch {
      doc = {};
    }
  }
  doc.mcpServers = { ...(doc.mcpServers ?? {}), clicksmith: spec };
  return {
    path,
    action: existingRaw == null ? 'create' : 'merge',
    contents: `${JSON.stringify(doc, null, 2)}\n`,
  };
}

async function wireViteConfig(root: string, relPath: string): Promise<FileChange | null> {
  const file = join(root, relPath);
  const code = await readText(file);
  if (code == null) return null;
  if (code.includes('@clicksmith/unplugin')) {
    return { path: relPath, action: 'skip', contents: code, reason: 'already wired' };
  }
  const importLine = `import clicksmith from '@clicksmith/unplugin/vite';\n`;
  // Insert plugin first in the array so it runs before the framework plugin.
  const pluginsMatch = code.match(/plugins\s*:\s*\[/);
  if (!pluginsMatch) return null;
  const idx = pluginsMatch.index! + pluginsMatch[0].length;
  const next = importLine + code.slice(0, idx) + 'clicksmith(), ' + code.slice(idx);
  return { path: relPath, action: 'merge', contents: next };
}

async function packageJsonChange(root: string, useUnplugin: boolean): Promise<FileChange> {
  const raw = await readText(join(root, 'package.json'));
  const pkg = raw ? JSON.parse(raw) : { name: 'project', version: '0.0.0' };
  pkg.devDependencies = { ...(pkg.devDependencies ?? {}) };
  pkg.devDependencies['@clicksmith/daemon'] = pkg.devDependencies['@clicksmith/daemon'] ?? 'latest';
  if (useUnplugin) {
    pkg.devDependencies['@clicksmith/unplugin'] =
      pkg.devDependencies['@clicksmith/unplugin'] ?? 'latest';
  }
  return {
    path: 'package.json',
    action: raw == null ? 'create' : 'merge',
    contents: `${JSON.stringify(pkg, null, 2)}\n`,
  };
}

async function gitignoreChange(root: string): Promise<FileChange> {
  const existing = await readText(join(root, '.gitignore'));
  if (
    existing?.split(/\r?\n/).some((l) => l.trim() === '.clicksmith/' || l.trim() === '.clicksmith')
  ) {
    return { path: '.gitignore', action: 'skip', contents: existing };
  }
  const contents = existing
    ? `${existing.trimEnd()}\n\n# ClickSmith runtime state\n.clicksmith/\n`
    : '# ClickSmith runtime state\n.clicksmith/\n';
  return { path: '.gitignore', action: existing == null ? 'create' : 'merge', contents };
}

function installCmd(pm: PackageManager): string {
  return pm === 'npm' ? 'npm install' : `${pm} install`;
}

function runCmd(pm: PackageManager, script: string): string {
  switch (pm) {
    case 'pnpm':
      return `pnpm exec ${script}`;
    case 'yarn':
      return `yarn ${script}`;
    case 'bun':
      return `bunx ${script}`;
    case 'npm':
      return `npx ${script}`;
  }
}

async function readText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}
