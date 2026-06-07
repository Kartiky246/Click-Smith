import { describe, expect, it } from 'vitest';
import { EventBus } from './events.js';

describe('EventBus', () => {
  it('replays only scoped run/session events', () => {
    const bus = new EventBus();

    bus.emit({
      type: 'agent-started',
      runId: 'run_a',
      sessionId: 'session_a',
      agentId: 'codex',
      sandbox: null,
    });
    bus.emit({ type: 'agent-log', runId: 'run_a', stream: 'stdout', chunk: 'a' });
    bus.emit({ type: 'agent-log', runId: 'run_b', stream: 'stdout', chunk: 'b' });

    expect(bus.replay()).toEqual([]);
    expect(bus.replay({ sessionId: 'session_a' }).map((event) => event.type)).toEqual([
      'agent-started',
    ]);
    expect(bus.replay({ runId: 'run_a' }).map((event) => event.type)).toEqual([
      'agent-started',
      'agent-log',
    ]);
  });
});
