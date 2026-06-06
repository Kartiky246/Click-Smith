import type { CaptureBundle, CapturedElement, Session } from '@clicksmith/core';
import type { FileStore } from './store.js';

/** Read-only view the MCP tools operate over, backed by daemon persistence. */
export interface McpReader {
  getSession(id: string): Promise<Session | undefined>;
  /** The bundle from the most recent submission, if any. */
  latestBundle(): Promise<CaptureBundle | undefined>;
}

/** Build an {@link McpReader} from a {@link FileStore}. */
export function readerFromStore(store: FileStore): McpReader {
  return {
    getSession: (id) => store.getSession(id),
    latestBundle: async () => {
      const run = await store.latestRun();
      return run ? store.getBundle(run.runId) : undefined;
    },
  };
}

/**
 * Tool definitions exposed over MCP. The **descriptions** deliberately teach the
 * agent the three ClickSmith conventions: `#N` references, locator priority, and
 * the plan/worktree safety contract.
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'get_latest_request',
    description:
      'Get the most recently submitted ClickSmith capture bundle (the latest UI change request). ' +
      'Returns the prompt, the app route, and the captured elements numbered #1, #2, … . ' +
      'The user prompt refers to elements by these numbers. Trust each element’s locator in the ' +
      'order source → attr → behavioral → dom (source = exact file:line). You are running in an ' +
      'isolated git worktree; in plan mode propose changes — the human clicks Apply to ship them.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_session',
    description:
      'Get a ClickSmith capture session by id, including all captured elements (#1, #2, …) and the ' +
      'app/route context. Use this to resolve which concrete elements the user’s #N references mean.',
    inputSchema: {
      type: 'object',
      properties: { sessionId: { type: 'string', description: 'The session id.' } },
      required: ['sessionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_elements',
    description:
      'List the captured elements for a session (or the latest request if no sessionId is given). ' +
      'Each element has an id (its #N), a ranked locator (source → attr → behavioral → dom), the ' +
      'tag/text/role/label, and nearby context for disambiguation.',
    inputSchema: {
      type: 'object',
      properties: { sessionId: { type: 'string', description: 'Optional session id.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_element_by_id',
    description:
      'Resolve a single captured element by its #N id (e.g. 1 for #1), within a session or the ' +
      'latest request. Returns its locator (prefer source over attr over behavioral over dom), the ' +
      'element descriptor, and near context.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The element’s #N number.' },
        sessionId: { type: 'string', description: 'Optional session id; defaults to latest.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
] as const;

export type ToolResult = { ok: true; text: string } | { ok: false; error: string };

/** Execute a read-only tool by name. Pure with respect to the reader. */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  reader: McpReader,
): Promise<ToolResult> {
  switch (name) {
    case 'get_latest_request': {
      const bundle = await reader.latestBundle();
      if (!bundle) return { ok: false, error: 'No request has been submitted yet.' };
      return { ok: true, text: json(bundle) };
    }
    case 'get_session': {
      const session = await reader.getSession(String(args.sessionId));
      if (!session) return { ok: false, error: `Unknown session: ${String(args.sessionId)}` };
      return { ok: true, text: json(session) };
    }
    case 'list_elements': {
      const elements = await resolveElements(reader, args.sessionId as string | undefined);
      if (!elements) return { ok: false, error: 'No session or latest request found.' };
      return { ok: true, text: json(elements) };
    }
    case 'get_element_by_id': {
      const id = Number(args.id);
      const elements = await resolveElements(reader, args.sessionId as string | undefined);
      if (!elements) return { ok: false, error: 'No session or latest request found.' };
      const element = elements.find((e) => e.id === id);
      if (!element) return { ok: false, error: `No element #${id} in this session.` };
      return { ok: true, text: json(element) };
    }
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

async function resolveElements(
  reader: McpReader,
  sessionId?: string,
): Promise<CapturedElement[] | undefined> {
  if (sessionId) return (await reader.getSession(sessionId))?.elements;
  return (await reader.latestBundle())?.elements;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
