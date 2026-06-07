import {
  appendElement,
  createSession,
  ExecutionOptionsSchema,
  finalizeSession,
  removeElement,
  touchSession,
  type ApplyResponse,
  type CaptureRequest,
  type CaptureResponse,
  type HealthResponse,
  type RemoveElementResponse,
  type RunRequest,
  type RunResponse,
  type Session,
  type SubmitRequest,
  type SubmitResponse,
} from '@clicksmith/core';
import { EventBus } from './events.js';
import { FileStore } from './store.js';
import { RunManager, type RunManagerDeps } from './run-manager.js';
import type { DaemonConfig } from './config.js';
import type { EnrichmentProvider } from './enrichment.js';
import { version as DAEMON_VERSION } from './version.js';

export interface DaemonServiceOptions {
  config: DaemonConfig;
  enrichment?: EnrichmentProvider;
  binExists?: RunManagerDeps['binExists'];
}

/**
 * The framework-agnostic core of the daemon. The HTTP/WS server and tests both
 * drive this; it owns sessions, runs, the event bus, and persistence.
 */
export class DaemonService {
  readonly config: DaemonConfig;
  readonly store: FileStore;
  readonly bus: EventBus;
  readonly runs: RunManager;

  constructor(opts: DaemonServiceOptions) {
    this.config = opts.config;
    this.store = new FileStore(opts.config.storageRoot);
    this.bus = new EventBus();
    this.runs = new RunManager({
      store: this.store,
      config: opts.config,
      bus: this.bus,
      logger: opts.config.logger,
      ...(opts.enrichment ? { enrichment: opts.enrichment } : {}),
      ...(opts.binExists ? { binExists: opts.binExists } : {}),
    });
  }

  async init(): Promise<void> {
    await this.store.init();
    await this.store.cleanupExpired();
  }

  /* ------------------------------- capture ------------------------------ */

  /** Create or append to the active session for an app/route. */
  async capture(req: CaptureRequest): Promise<CaptureResponse> {
    const now = new Date();
    let session = req.sessionId ? await this.store.getSession(req.sessionId) : undefined;
    if (!session) {
      session = createSession({ app: req.app, now, ttlMs: this.config.ttlMs });
    } else {
      session = touchSession(session, now, this.config.ttlMs);
    }

    const { session: next, element } = appendElement(session, req.element, now);
    await this.store.saveSession(next);

    this.bus.emit({ type: 'capture-ack', sessionId: next.id, element });
    return { sessionId: next.id, element };
  }

  async removeElement(sessionId: string, elementId: number): Promise<RemoveElementResponse> {
    const session = await this.store.getSession(sessionId);
    if (!session) return { removed: false };
    const { session: next, removed } = removeElement(session, elementId);
    if (removed) {
      await this.store.saveSession(next);
      this.bus.emit({ type: 'element-removed', sessionId, elementId });
    }
    return { removed };
  }

  async getSession(id: string): Promise<Session | undefined> {
    return this.store.getSession(id);
  }

  /* ------------------------------- submit ------------------------------- */

  /** Finalize a session into a bundle and start a run. */
  async submit(req: SubmitRequest): Promise<SubmitResponse> {
    const session = await this.store.getSession(req.sessionId);
    if (!session) throw new NotFoundError(`Unknown session: ${req.sessionId}`);

    const execution = ExecutionOptionsSchema.parse(req.execution ?? {});
    const bundle = finalizeSession(session, {
      prompt: req.prompt,
      execution,
      ...(req.enrichment ? { enrichment: req.enrichment } : {}),
    });

    const submitted: Session = { ...session, status: 'submitted', prompt: req.prompt };
    await this.store.saveSession(submitted);

    const { run } = await this.runs.createRun(bundle);
    return { runId: run.runId, bundle };
  }

  /** Fast path: create a run directly from elements + prompt, no prior session needed. */
  async run(req: RunRequest): Promise<RunResponse> {
    const now = new Date();
    const execution = ExecutionOptionsSchema.parse(req.execution ?? {});

    let session = createSession({ app: req.app, now, ttlMs: this.config.ttlMs });
    for (const elementInput of req.elements) {
      const { session: next } = appendElement(session, elementInput, now);
      session = next;
    }
    await this.store.saveSession({ ...session, status: 'submitted', prompt: req.prompt });

    const bundle = finalizeSession(session, {
      prompt: req.prompt,
      execution,
      ...(req.enrichment ? { enrichment: req.enrichment } : {}),
    });

    const { run } = await this.runs.createRun(bundle);
    return { runId: run.runId, sessionId: session.id, bundle };
  }

  async apply(runId: string): Promise<ApplyResponse> {
    return this.runs.apply(runId);
  }

  /* ------------------------------- health ------------------------------- */

  async health(): Promise<HealthResponse> {
    const sessions = await this.store.listSessions();
    return {
      ok: true,
      name: 'clicksmith-daemon',
      version: DAEMON_VERSION,
      host: this.config.host,
      port: this.config.port,
      repoRoot: this.config.repoRoot,
      activeSessions: sessions.filter((s) => s.status === 'active').length,
    };
  }
}

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';
}
