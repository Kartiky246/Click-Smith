import { CaptureBundleSchema, CURRENT_BUNDLE_VERSION } from './schemas.js';
import { newSessionId, nextElementId } from './ids.js';
import { DEFAULT_EXECUTION_OPTIONS, DEFAULT_SESSION_TTL_MS } from './defaults.js';
import type {
  AppContext,
  CaptureBundle,
  CapturedElement,
  CapturedElementInput,
  ExecutionOptions,
  Session,
} from './types.js';

export interface CreateSessionInput {
  app: AppContext;
  now?: Date;
  ttlMs?: number;
  id?: string;
}

/** Create a fresh, empty, active capture session. Pure. */
export function createSession(input: CreateSessionInput): Session {
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? DEFAULT_SESSION_TTL_MS;
  const iso = now.toISOString();
  return {
    id: input.id ?? newSessionId(now),
    createdAt: iso,
    updatedAt: iso,
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    status: 'active',
    app: input.app,
    elements: [],
    lastElementId: 0,
  };
}

/**
 * Append a captured element to a session, assigning the next stable id. Returns
 * a new session plus the fully-formed element (so callers know the assigned id).
 * Pure — the input session is not mutated.
 */
export function appendElement(
  session: Session,
  input: CapturedElementInput,
  now: Date = new Date(),
): { session: Session; element: CapturedElement } {
  const id = nextElementId(
    session.elements.map((e) => e.id),
    session.lastElementId,
  );
  const element: CapturedElement = { ...input, id };
  const next: Session = {
    ...session,
    elements: [...session.elements, element],
    lastElementId: id,
    updatedAt: now.toISOString(),
  };
  return { session: next, element };
}

/**
 * Remove a captured element by id. Ids are never renumbered, keeping existing
 * `#N` references valid. Returns the new session and whether anything changed.
 * Pure.
 */
export function removeElement(
  session: Session,
  elementId: number,
  now: Date = new Date(),
): { session: Session; removed: boolean } {
  const elements = session.elements.filter((e) => e.id !== elementId);
  const removed = elements.length !== session.elements.length;
  if (!removed) return { session, removed: false };
  return {
    session: { ...session, elements, updatedAt: now.toISOString() },
    removed: true,
  };
}

/** Find a captured element by its `#N` id. */
export function findElement(session: Session, elementId: number): CapturedElement | undefined {
  return session.elements.find((e) => e.id === elementId);
}

/** Whether a session has passed its expiry (and was never submitted). */
export function isExpired(session: Session, now: Date = new Date()): boolean {
  if (session.status === 'submitted') return false;
  return new Date(session.expiresAt).getTime() <= now.getTime();
}

/** Slide a session's expiry forward by `ttlMs` from `now`. Pure. */
export function touchSession(
  session: Session,
  now: Date = new Date(),
  ttlMs: number = DEFAULT_SESSION_TTL_MS,
): Session {
  return {
    ...session,
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
}

export interface FinalizeInput {
  prompt: string;
  execution?: ExecutionOptions;
  submittedAt?: Date;
  enrichment?: CaptureBundle['enrichment'];
}

/**
 * Finalize a session into a validated v5 {@link CaptureBundle}. Throws if the
 * session has no elements or the prompt is empty. Does not mutate the session.
 */
export function finalizeSession(session: Session, input: FinalizeInput): CaptureBundle {
  if (session.elements.length === 0) {
    throw new Error(`Cannot finalize session ${session.id}: no captured elements.`);
  }
  if (!input.prompt.trim()) {
    throw new Error(`Cannot finalize session ${session.id}: prompt is empty.`);
  }
  const bundle: CaptureBundle = {
    v: CURRENT_BUNDLE_VERSION,
    sessionId: session.id,
    submittedAt: (input.submittedAt ?? new Date()).toISOString(),
    prompt: input.prompt.trim(),
    app: session.app,
    elements: session.elements,
    execution: input.execution ?? { ...DEFAULT_EXECUTION_OPTIONS },
    ...(input.enrichment ? { enrichment: input.enrichment } : {}),
  };
  // Validate before handing off; surfaces schema regressions early.
  return CaptureBundleSchema.parse(bundle);
}
