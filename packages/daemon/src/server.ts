import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import {
  CaptureRequestSchema,
  SubmitRequestSchema,
  type ClientMessage,
  type ServerEvent,
} from '@clicksmith/core';
import { type DaemonService, NotFoundError } from './daemon-service.js';
import { RefusalError } from './run-manager.js';

type SubscribeMessage = Extract<ClientMessage, { type: 'subscribe' }> & { runId?: string };

/**
 * Build the Fastify app exposing ClickSmith's HTTP + WebSocket surface on top
 * of a {@link DaemonService}. Binds loopback only; CORS is opened for localhost
 * so the browser extension can talk to it.
 */
export async function buildServer(service: DaemonService): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Minimal CORS for the extension (loopback only).
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'content-type');
    if (req.method === 'OPTIONS') {
      reply.code(204).send();
    }
  });

  await app.register(websocket);

  /* ------------------------------- HTTP -------------------------------- */

  app.get('/health', async () => service.health());

  app.post('/capture', async (req, reply) => {
    const parsed = CaptureRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    return service.capture(parsed.data);
  });

  app.post('/submit', async (req, reply) => {
    const parsed = SubmitRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    try {
      return await service.submit(parsed.data);
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
      if (err instanceof RefusalError)
        return reply.code(409).send({ error: err.message, code: err.code });
      throw err;
    }
  });

  app.post<{ Params: { runId: string } }>('/apply/:runId', async (req, reply) => {
    try {
      return await service.apply(req.params.runId);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get<{ Params: { id: string } }>('/session/:id', async (req, reply) => {
    const session = await service.getSession(req.params.id);
    if (!session) return reply.code(404).send({ error: `Unknown session: ${req.params.id}` });
    return session;
  });

  app.delete<{ Params: { sessionId: string; elementId: string } }>(
    '/element/:sessionId/:elementId',
    async (req) => {
      const elementId = Number.parseInt(req.params.elementId, 10);
      return service.removeElement(req.params.sessionId, elementId);
    },
  );

  /* ----------------------------- WebSocket ----------------------------- */

  app.get('/ws', { websocket: true }, (socket) => {
    const send = (event: ServerEvent) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    };
    const unsubscribe = service.bus.subscribe(send);

    socket.on('message', (raw: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return;
      }
      if (msg.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
      else if (msg.type === 'subscribe') {
        // Replay only the run/session the client asks for. Unscoped replay can
        // flood reconnecting extension workers with unrelated historical logs.
        const sub = msg as SubscribeMessage;
        for (const event of service.bus.replay({ runId: sub.runId, sessionId: sub.sessionId })) {
          send(event);
        }
      }
    });

    socket.on('close', unsubscribe);
    socket.on('error', unsubscribe);
  });

  return app;
}
