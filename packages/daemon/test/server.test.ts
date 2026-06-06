import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { resolveDaemonConfig } from '../src/config.js';
import { DaemonService } from '../src/daemon-service.js';
import { buildServer } from '../src/server.js';
import { appContext, elementInput, waitFor } from './helpers.js';

let app: FastifyInstance;
let base: string;
let storage: string;

beforeAll(async () => {
  storage = await mkdtemp(join(tmpdir(), 'clicksmith-srv-'));
  const config = await resolveDaemonConfig({
    repoRoot: null,
    storageRoot: storage,
    logLevel: 'silent',
  });
  const service = new DaemonService({ config, binExists: async () => true });
  await service.init();
  app = await buildServer(service);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const { port } = app.server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app.close();
  await rm(storage, { recursive: true, force: true });
});

describe('HTTP + WebSocket server', () => {
  it('serves /health', async () => {
    const res = await fetch(`${base}/health`);
    const body = (await res.json()) as { ok: boolean; name: string };
    expect(body.ok).toBe(true);
    expect(body.name).toBe('clicksmith-daemon');
  });

  it('captures over HTTP and streams a capture-ack over WS', async () => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws`);
    const messages: Array<{ type: string }> = [];
    await new Promise<void>((resolve) => ws.on('open', () => resolve()));
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
    ws.send(JSON.stringify({ type: 'subscribe' }));

    const res = await fetch(`${base}/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ app: appContext('/x'), element: elementInput('/x', 'Buy', 5) }),
    });
    const captured = (await res.json()) as { sessionId: string; element: { id: number } };
    expect(captured.element.id).toBe(1);

    await waitFor(() => messages.some((m) => m.type === 'capture-ack'));

    // session is readable, and element removal is broadcast.
    const session = (await (await fetch(`${base}/session/${captured.sessionId}`)).json()) as {
      elements: unknown[];
    };
    expect(session.elements).toHaveLength(1);

    const removed = (await (
      await fetch(`${base}/element/${captured.sessionId}/1`, { method: 'DELETE' })
    ).json()) as { removed: boolean };
    expect(removed.removed).toBe(true);
    await waitFor(() => messages.some((m) => m.type === 'element-removed'));

    ws.close();
  });

  it('rejects malformed capture payloads with 400', async () => {
    const res = await fetch(`${base}/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nope: true }),
    });
    expect(res.status).toBe(400);
  });
});
