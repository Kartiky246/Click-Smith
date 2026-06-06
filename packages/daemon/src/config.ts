import { readFile } from 'node:fs/promises';
import {
  DEFAULT_AGENTS_CONFIG,
  mergeAgentsConfig,
  parseAgentsConfig,
  type AgentsConfig,
} from '@clicksmith/agent-config';
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT, DEFAULT_SESSION_TTL_MS } from '@clicksmith/core';
import { Git } from './git.js';
import { resolveStorageRoot, storagePaths } from './paths.js';
import { createLogger, type LogLevel, type Logger } from './logger.js';

export interface DaemonConfigInput {
  cwd?: string;
  host?: string;
  port?: number;
  ttlMs?: number;
  logLevel?: LogLevel;
  /** Override the storage root (mainly for tests). */
  storageRoot?: string;
  /** Override repo detection (mainly for tests). */
  repoRoot?: string | null;
}

export interface DaemonConfig {
  host: string;
  port: number;
  ttlMs: number;
  cwd: string;
  repoRoot: string | null;
  storageRoot: string;
  agents: AgentsConfig;
  logger: Logger;
}

/**
 * Resolve the full daemon configuration: detect the repo, choose a storage
 * root, and layer agent configs (shipped defaults → project `agents.config.json`).
 */
export async function resolveDaemonConfig(input: DaemonConfigInput = {}): Promise<DaemonConfig> {
  const cwd = input.cwd ?? process.cwd();
  const repoRoot = input.repoRoot !== undefined ? input.repoRoot : await Git.findRepoRoot(cwd);
  const storageRoot = input.storageRoot ?? resolveStorageRoot(repoRoot);
  const agents = await loadAgentsConfig(storageRoot);

  return {
    host: input.host ?? DEFAULT_DAEMON_HOST,
    port: input.port ?? DEFAULT_DAEMON_PORT,
    ttlMs: input.ttlMs ?? DEFAULT_SESSION_TTL_MS,
    cwd,
    repoRoot,
    storageRoot,
    agents,
    logger: createLogger(input.logLevel ?? 'info'),
  };
}

/** Load `agents.config.json` from the storage root and merge over defaults. */
export async function loadAgentsConfig(storageRoot: string): Promise<AgentsConfig> {
  const file = storagePaths(storageRoot).config;
  let raw: string | undefined;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return DEFAULT_AGENTS_CONFIG;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return DEFAULT_AGENTS_CONFIG;
  }
  const parsed = parseAgentsConfig(json);
  if (!parsed.ok) return DEFAULT_AGENTS_CONFIG;
  return mergeAgentsConfig(DEFAULT_AGENTS_CONFIG, parsed.config);
}
