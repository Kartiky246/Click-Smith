import {
  DEFAULT_DAEMON_HOST,
  DEFAULT_DAEMON_PORT,
  type ApplyResponse,
  type CaptureRequest,
  type CaptureResponse,
  type HealthResponse,
  type RunRequest,
  type RunResponse,
  type ServerEvent,
  type SubmitRequest,
  type SubmitResponse,
} from '@clicksmith/core';

type AgentLogEvent = Extract<ServerEvent, { type: 'agent-log' }>;

export interface DaemonClientOptions {
  host?: string;
  port?: number;
  onEvent?: (event: ServerEvent) => void;
  onConnectionChange?: (connected: boolean) => void;
}

/**
 * A thin client for the ClickSmith daemon: REST calls plus an auto-reconnecting
 * WebSocket that surfaces run events. Lives in the background service worker.
 */
export class DaemonClient {
  private readonly base: string;
  private readonly wsUrl: string;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly runSubscriptions = new Set<string>();
  private readonly pendingLogs = new Map<string, AgentLogEvent>();
  private logFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;

  constructor(private readonly options: DaemonClientOptions = {}) {
    const host = options.host ?? DEFAULT_DAEMON_HOST;
    const port = options.port ?? DEFAULT_DAEMON_PORT;
    this.base = `http://${host}:${port}`;
    this.wsUrl = `ws://${host}:${port}/ws`;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async health(): Promise<HealthResponse> {
    return this.json<HealthResponse>('GET', '/health');
  }

  async capture(req: CaptureRequest): Promise<CaptureResponse> {
    return this.json<CaptureResponse>('POST', '/capture', req);
  }

  async submit(req: SubmitRequest): Promise<SubmitResponse> {
    return this.json<SubmitResponse>('POST', '/submit', req);
  }

  async run(req: RunRequest): Promise<RunResponse> {
    return this.json<RunResponse>('POST', '/run', req);
  }

  watchRun(runId: string): void {
    this.runSubscriptions.add(runId);
    this.sendSubscribe(runId);
  }

  async apply(runId: string): Promise<ApplyResponse> {
    return this.json<ApplyResponse>('POST', `/apply/${encodeURIComponent(runId)}`);
  }

  async removeElement(sessionId: string, elementId: number): Promise<{ removed: boolean }> {
    return this.json('DELETE', `/element/${encodeURIComponent(sessionId)}/${elementId}`);
  }

  /** Open (or reopen) the event WebSocket, retrying on failure. */
  connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.addEventListener('open', () => {
      this.setConnected(true);
      for (const runId of this.runSubscriptions) this.sendSubscribe(runId);
    });
    this.ws.addEventListener('message', (ev) => {
      try {
        const event = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as ServerEvent;
        if (event && 'type' in event) this.handleEvent(event);
      } catch {
        /* ignore non-JSON frames (e.g. pong) */
      }
    });
    this.ws.addEventListener('close', () => {
      this.setConnected(false);
      this.scheduleReconnect();
    });
    this.ws.addEventListener('error', () => this.ws?.close());
  }

  dispose(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.logFlushTimer) clearTimeout(this.logFlushTimer);
    this.flushLogs();
    this.ws?.close();
    this.ws = null;
  }

  private handleEvent(event: ServerEvent): void {
    if (event.type === 'agent-log') {
      this.bufferLog(event);
      return;
    }
    this.flushLogs();
    this.options.onEvent?.(event);
  }

  private bufferLog(event: AgentLogEvent): void {
    const key = `${event.runId}:${event.stream}`;
    const pending = this.pendingLogs.get(key);
    this.pendingLogs.set(key, pending ? { ...pending, chunk: pending.chunk + event.chunk } : event);
    if (this.logFlushTimer) return;
    this.logFlushTimer = setTimeout(() => {
      this.logFlushTimer = null;
      this.flushLogs();
    }, 75);
  }

  private flushLogs(): void {
    if (this.logFlushTimer) {
      clearTimeout(this.logFlushTimer);
      this.logFlushTimer = null;
    }
    if (this.pendingLogs.size === 0) return;
    const events = [...this.pendingLogs.values()];
    this.pendingLogs.clear();
    for (const event of events) this.options.onEvent?.(event);
  }

  private sendSubscribe(runId: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'subscribe', runId }));
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private setConnected(value: boolean): void {
    if (this.connected !== value) {
      this.connected = value;
      this.options.onConnectionChange?.(value);
    }
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`daemon ${method} ${path} failed (${res.status}): ${text}`);
    }
    return (await res.json()) as T;
  }
}
