#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { resolveDaemonConfig } from './config.js';
import { FileStore } from './store.js';
import { callTool, readerFromStore, TOOL_DEFINITIONS, type McpReader } from './mcp-tools.js';
import { version } from './version.js';

/**
 * Create an MCP {@link Server} exposing ClickSmith's read-only tools over the
 * given reader. The daemon and a standalone `clicksmith mcp` process both use
 * this; state is shared via the on-disk store, so the MCP process never needs
 * to talk to the HTTP daemon directly.
 */
export function createMcpServer(reader: McpReader): Server {
  const server = new Server(
    { name: 'clicksmith', version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await callTool(name, args ?? {}, reader);
    if (!result.ok) {
      return { content: [{ type: 'text', text: result.error }], isError: true };
    }
    return { content: [{ type: 'text', text: result.text }] };
  });

  return server;
}

/** Entry point for `clicksmith mcp`: connect the stdio transport. */
export async function startMcp(): Promise<void> {
  const config = await resolveDaemonConfig({ logLevel: 'silent' });
  const store = new FileStore(config.storageRoot);
  await store.init();
  const server = createMcpServer(readerFromStore(store));
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Allow running this file directly as the MCP server.
if (import.meta.url === `file://${process.argv[1]}`) {
  startMcp().catch((err) => {
    process.stderr.write(`clicksmith mcp failed: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
}
