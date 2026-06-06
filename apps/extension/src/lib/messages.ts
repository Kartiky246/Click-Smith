import type {
  CaptureResponse,
  CapturedElementInput,
  ExecutionOptions,
  ServerEvent,
  SubmitResponse,
} from '@clicksmith/core';

/**
 * The message protocol between the content script / popup and the background
 * service worker. The background is the *only* part of the extension that talks
 * to the loopback daemon — content scripts run in the page and would be subject
 * to the page's CSP, so all daemon I/O is proxied through here.
 */
export type ContentToBackground =
  | { type: 'capture'; app: AppRef; element: CapturedElementInput; sessionId?: string }
  | { type: 'remove-element'; sessionId: string; elementId: number }
  | { type: 'submit'; sessionId: string; prompt: string; execution?: Partial<ExecutionOptions> }
  | { type: 'apply'; runId: string }
  | { type: 'get-state' }
  | { type: 'set-ai-mode'; enabled: boolean }
  | { type: 'set-agent'; agentId: string }
  | { type: 'health' };

export interface AppRef {
  url: string;
  route: string;
  page?: string;
}

export type BackgroundResponse =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

export interface ExtensionState {
  aiMode: boolean;
  agentId: string | null;
  daemonConnected: boolean;
}

/** Events the background pushes to content scripts/popup (mirrors daemon WS). */
export type BackgroundEvent = { type: 'daemon-event'; event: ServerEvent } | { type: 'state'; state: ExtensionState };

export type CaptureResult = CaptureResponse;
export type SubmitResult = SubmitResponse;
