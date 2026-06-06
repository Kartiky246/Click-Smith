import { z } from 'zod';
import {
  AppContextSchema,
  CapturedElementSchema,
  EnrichmentSchema,
  ExecutionOptionsSchema,
} from './schemas.js';
import type { CaptureBundle, CapturedElement, Session } from './types.js';

/* -------------------------------------------------------------------------- */
/*                         HTTP request / response DTOs                       */
/* -------------------------------------------------------------------------- */

/** The element payload the extension sends (everything but the daemon id). */
export const CapturedElementInputSchema = CapturedElementSchema.omit({ id: true });

export const CaptureRequestSchema = z.object({
  /** Append to this session if present; otherwise the daemon opens one. */
  sessionId: z.string().optional(),
  app: AppContextSchema,
  element: CapturedElementInputSchema,
});
export type CaptureRequest = z.infer<typeof CaptureRequestSchema>;

export interface CaptureResponse {
  sessionId: string;
  element: CapturedElement;
}

export const SubmitRequestSchema = z.object({
  sessionId: z.string().min(1),
  prompt: z.string().min(1),
  execution: ExecutionOptionsSchema.partial().optional(),
  enrichment: EnrichmentSchema.optional(),
});
export type SubmitRequest = z.infer<typeof SubmitRequestSchema>;

export interface SubmitResponse {
  runId: string;
  bundle: CaptureBundle;
}

export interface ApplyResponse {
  applied: boolean;
  commit?: string;
  conflicts?: string[];
}

export interface HealthResponse {
  ok: true;
  name: 'clicksmith-daemon';
  version: string;
  host: string;
  port: number;
  repoRoot: string | null;
  activeSessions: number;
}

export type SessionResponse = Session;

export interface RemoveElementResponse {
  removed: boolean;
}

/* -------------------------------------------------------------------------- */
/*                                 Run state                                  */
/* -------------------------------------------------------------------------- */

export const RunStatusSchema = z.enum([
  'pending',
  'running',
  'plan-ready',
  'done',
  'applying',
  'applied',
  'error',
  'apply-error',
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export interface RunSummary {
  runId: string;
  sessionId: string;
  agentId: string;
  status: RunStatus;
  createdAt: string;
  sandbox: SandboxInfo | null;
}

export interface SandboxInfo {
  isolation: 'worktree' | 'branch' | 'inplace';
  path: string;
  branch: string | null;
  baseCommit: string;
}

/* -------------------------------------------------------------------------- */
/*                          WebSocket event protocol                          */
/* -------------------------------------------------------------------------- */

/** Events streamed from daemon to the extension over the WebSocket. */
export type ServerEvent =
  | { type: 'capture-ack'; sessionId: string; element: CapturedElement }
  | { type: 'element-removed'; sessionId: string; elementId: number }
  | { type: 'agent-started'; runId: string; sessionId: string; agentId: string; sandbox: SandboxInfo | null }
  | { type: 'agent-log'; runId: string; stream: 'stdout' | 'stderr'; chunk: string }
  | { type: 'plan-ready'; runId: string; plan?: string; diff?: string }
  | { type: 'agent-done'; runId: string; exitCode: number }
  | { type: 'agent-error'; runId: string; message: string }
  | { type: 'apply-started'; runId: string }
  | { type: 'apply-done'; runId: string; commit?: string }
  | { type: 'apply-error'; runId: string; message: string; conflicts?: string[] };

export type ServerEventType = ServerEvent['type'];

/** Messages the extension may send to the daemon over the WebSocket. */
export type ClientMessage =
  | { type: 'subscribe'; sessionId?: string }
  | { type: 'ping' };

/** Ordered list of every WS event type, useful for tests and docs. */
export const SERVER_EVENT_TYPES = [
  'capture-ack',
  'element-removed',
  'agent-started',
  'agent-log',
  'plan-ready',
  'agent-done',
  'agent-error',
  'apply-started',
  'apply-done',
  'apply-error',
] as const satisfies readonly ServerEventType[];
