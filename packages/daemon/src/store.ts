import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  deserializeBundle,
  isExpired,
  serializeBundle,
  type CaptureBundle,
  type Session,
} from '@clicksmith/core';
import { storagePaths, type StoragePaths } from './paths.js';
import type { RunRecord } from './types.js';

/**
 * File-backed persistence for sessions, runs, and run artifacts. Everything is
 * stored as JSON/markdown/patch files under the storage root — no database, no
 * network. Writes are atomic (temp file + rename) to survive crashes.
 */
export class FileStore {
  readonly paths: StoragePaths;

  constructor(root: string) {
    this.paths = storagePaths(root);
  }

  async init(): Promise<void> {
    await Promise.all([
      mkdir(this.paths.sessions, { recursive: true }),
      mkdir(this.paths.runs, { recursive: true }),
      mkdir(this.paths.screenshots, { recursive: true }),
    ]);
  }

  /* ----------------------------- sessions ------------------------------ */

  private sessionFile(id: string): string {
    return join(this.paths.sessions, `${sanitize(id)}.json`);
  }

  async saveSession(session: Session): Promise<void> {
    await atomicWrite(this.sessionFile(session.id), JSON.stringify(session, null, 2));
  }

  async getSession(id: string): Promise<Session | undefined> {
    return readJson<Session>(this.sessionFile(id));
  }

  async listSessions(): Promise<Session[]> {
    const out: Session[] = [];
    for (const file of await listJson(this.paths.sessions)) {
      const s = await readJson<Session>(join(this.paths.sessions, file));
      if (s) out.push(s);
    }
    return out;
  }

  async deleteSession(id: string): Promise<void> {
    await rm(this.sessionFile(id), { force: true });
  }

  /* -------------------------------- runs -------------------------------- */

  private runDir(runId: string): string {
    return this.paths.runDir(runId);
  }

  private runFile(runId: string): string {
    return join(this.runDir(runId), 'run.json');
  }

  async saveRun(run: RunRecord): Promise<void> {
    await mkdir(this.runDir(run.runId), { recursive: true });
    await atomicWrite(this.runFile(run.runId), JSON.stringify(run, null, 2));
  }

  async getRun(runId: string): Promise<RunRecord | undefined> {
    return readJson<RunRecord>(this.runFile(runId));
  }

  async listRuns(): Promise<RunRecord[]> {
    let dirs: string[];
    try {
      dirs = await readdir(this.paths.runs);
    } catch {
      return [];
    }
    const out: RunRecord[] = [];
    for (const dir of dirs) {
      const run = await readJson<RunRecord>(join(this.paths.runs, dir, 'run.json'));
      if (run) out.push(run);
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** The most recent run that has a persisted bundle (for `get_latest_request`). */
  async latestRun(): Promise<RunRecord | undefined> {
    const runs = await this.listRuns();
    return runs.at(-1);
  }

  /* ----------------------------- artifacts ------------------------------ */

  async saveBundle(runId: string, bundle: CaptureBundle): Promise<string> {
    await mkdir(this.runDir(runId), { recursive: true });
    const file = join(this.runDir(runId), 'bundle.json');
    await atomicWrite(file, serializeBundle(bundle));
    return file;
  }

  async getBundle(runId: string): Promise<CaptureBundle | undefined> {
    const raw = await readText(join(this.runDir(runId), 'bundle.json'));
    return raw ? deserializeBundle(raw) : undefined;
  }

  bundlePath(runId: string): string {
    return join(this.runDir(runId), 'bundle.json');
  }

  async writeArtifact(runId: string, name: string, content: string): Promise<string> {
    await mkdir(this.runDir(runId), { recursive: true });
    const file = join(this.runDir(runId), name);
    await atomicWrite(file, content);
    return file;
  }

  async readArtifact(runId: string, name: string): Promise<string | undefined> {
    return readText(join(this.runDir(runId), name));
  }

  async appendLog(runId: string, chunk: string): Promise<void> {
    const file = join(this.runDir(runId), 'agent.log');
    await mkdir(this.runDir(runId), { recursive: true });
    const existing = (await readText(file)) ?? '';
    await writeFile(file, existing + chunk, 'utf8');
  }

  /* ----------------------------- maintenance ----------------------------- */

  /** Delete expired, unsubmitted sessions. Returns the ids removed. */
  async cleanupExpired(now: Date = new Date()): Promise<string[]> {
    const removed: string[] = [];
    for (const session of await this.listSessions()) {
      if (isExpired(session, now)) {
        await this.deleteSession(session.id);
        removed.push(session.id);
      }
    }
    return removed;
  }
}

/* -------------------------------- helpers --------------------------------- */

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function atomicWrite(file: string, content: string): Promise<void> {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, content, 'utf8');
  const { rename } = await import('node:fs/promises');
  await rename(tmp, file);
}

async function readText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}

async function readJson<T>(file: string): Promise<T | undefined> {
  const raw = await readText(file);
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

async function listJson(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
}
