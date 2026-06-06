import type { ServerEvent } from '@clicksmith/core';

type Listener = (event: ServerEvent) => void;

/**
 * A tiny synchronous pub/sub for {@link ServerEvent}s. The Fastify WebSocket
 * layer subscribes to fan events out to connected extension clients; the run
 * manager publishes. Kept dependency-free and ordered (listeners fire in
 * registration order, events in emit order).
 */
export class EventBus {
  private readonly listeners = new Set<Listener>();
  private readonly history: ServerEvent[] = [];
  private readonly maxHistory: number;

  constructor(maxHistory = 500) {
    this.maxHistory = maxHistory;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: ServerEvent): void {
    this.history.push(event);
    if (this.history.length > this.maxHistory) this.history.shift();
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A misbehaving listener must never break the emit loop.
      }
    }
  }

  /** Replay buffered events, optionally filtered to a run id. */
  replay(runId?: string): ServerEvent[] {
    if (!runId) return [...this.history];
    return this.history.filter((e) => 'runId' in e && e.runId === runId);
  }
}
