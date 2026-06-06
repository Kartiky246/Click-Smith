/**
 * @clicksmith/daemon
 *
 * The localhost daemon: Fastify HTTP + WebSocket, MCP stdio server,
 * file-backed persistence, git sandbox orchestration, and config-driven agent
 * launching. Everything stays local.
 */

export { DaemonService, NotFoundError, type DaemonServiceOptions } from './daemon-service.js';
export { buildServer } from './server.js';
export { resolveDaemonConfig, loadAgentsConfig, type DaemonConfig, type DaemonConfigInput } from './config.js';
export { RunManager, RefusalError, type RunManagerDeps } from './run-manager.js';
export { FileStore } from './store.js';
export { EventBus } from './events.js';
export { Git, GitError, describeSandbox } from './git.js';
export { launchAgent, type LaunchResult, type LaunchHandlers } from './launcher.js';
export { enrichBundle, type EnrichmentProvider } from './enrichment.js';
export { createMcpServer, startMcp } from './mcp.js';
export {
  callTool,
  readerFromStore,
  TOOL_DEFINITIONS,
  type McpReader,
  type ToolResult,
} from './mcp-tools.js';
export { resolveStorageRoot, osCacheRoot, storagePaths } from './paths.js';
export { createLogger, type Logger, type LogLevel } from './logger.js';
export { version } from './version.js';
export type { RunRecord, RunArtifacts, RevertMeta } from './types.js';
