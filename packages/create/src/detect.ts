import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';
export type Bundler = 'vite' | 'webpack' | 'rspack' | 'rollup' | 'next' | 'unknown';
export type Framework = 'react' | 'vue' | 'svelte' | 'angular' | 'solid' | 'unknown';

export interface ProjectInfo {
  root: string;
  packageManager: PackageManager;
  bundler: Bundler;
  framework: Framework;
  /** Stable attributes already used in the codebase (e.g. data-testid). */
  stableAttrs: string[];
  /** Whether the dev-only data-loc unplugin can be wired up for this stack. */
  supportsUnplugin: boolean;
  /** Path to the detected Vite config, if any (relative to root). */
  viteConfig?: string;
}

const KNOWN_STABLE_ATTRS = ['data-testid', 'data-test', 'data-cy', 'data-qa'];

/** Inspect a project directory and infer its stack. Read-only. */
export async function detectProject(root: string): Promise<ProjectInfo> {
  const pkg = await readJson(join(root, 'package.json'));
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) } as Record<string, string>;

  const packageManager = await detectPackageManager(root);
  const bundler = detectBundler(deps);
  const framework = detectFramework(deps);
  const viteConfig = await findFile(root, ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']);
  const stableAttrs = await scanStableAttrs(root);

  const supportsUnplugin =
    framework === 'react' && ['vite', 'webpack', 'rspack', 'rollup'].includes(bundler);

  return {
    root,
    packageManager,
    bundler,
    framework,
    stableAttrs,
    supportsUnplugin,
    ...(viteConfig ? { viteConfig } : {}),
  };
}

async function detectPackageManager(root: string): Promise<PackageManager> {
  if (await fileExists(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fileExists(join(root, 'yarn.lock'))) return 'yarn';
  if (await fileExists(join(root, 'bun.lockb'))) return 'bun';
  return 'npm';
}

function detectBundler(deps: Record<string, string>): Bundler {
  if (deps.next) return 'next';
  if (deps.vite) return 'vite';
  if (deps['@rspack/core']) return 'rspack';
  if (deps.webpack) return 'webpack';
  if (deps.rollup) return 'rollup';
  return 'unknown';
}

function detectFramework(deps: Record<string, string>): Framework {
  if (deps['@angular/core']) return 'angular';
  if (deps.svelte) return 'svelte';
  if (deps.vue) return 'vue';
  if (deps['solid-js']) return 'solid';
  if (deps.react) return 'react';
  return 'unknown';
}

/** Scan a handful of source files for stable test/id attributes. */
async function scanStableAttrs(root: string): Promise<string[]> {
  const found = new Set<string>();
  const dirs = ['src', 'app', 'components'];
  for (const dir of dirs) {
    const files = await listSourceFiles(join(root, dir), 40);
    for (const file of files) {
      const content = await safeRead(file);
      if (!content) continue;
      for (const attr of KNOWN_STABLE_ATTRS) {
        if (content.includes(attr)) found.add(attr);
      }
      if (found.size === KNOWN_STABLE_ATTRS.length) return [...found];
    }
  }
  return [...found];
}

async function listSourceFiles(dir: string, limit: number): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    if (out.length >= limit) return;
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= limit) return;
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(jsx?|tsx?|vue|svelte)$/.test(entry.name)) out.push(full);
    }
  }
  await walk(dir);
  return out;
}

async function findFile(root: string, names: string[]): Promise<string | undefined> {
  for (const name of names) {
    if (await fileExists(join(root, name))) return name;
  }
  return undefined;
}

async function readJson(file: string): Promise<Record<string, unknown> | undefined> {
  const raw = await safeRead(file);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function safeRead(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}

async function fileExists(file: string): Promise<boolean> {
  return (await safeRead(file)) !== undefined;
}
