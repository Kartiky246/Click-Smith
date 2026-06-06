import type { ExecutionMode, Isolation } from '@clicksmith/core';

/** Every placeholder the launcher knows how to resolve in a command template. */
export const PLACEHOLDER_KEYS = [
  'bundlePath',
  'prompt',
  'instructionFile',
  'mode',
  'mcpServer',
  'cwd',
] as const;

export type PlaceholderKey = (typeof PLACEHOLDER_KEYS)[number];

/**
 * Everything the launcher needs to turn a config-driven command template into a
 * concrete process invocation. This is also the `ctx` passed to adapter hooks.
 */
export interface AgentLaunchContext {
  /** Absolute path to the serialized capture bundle. */
  bundlePath: string;
  /** The user's free-text prompt. */
  prompt: string;
  /** Absolute path to the rendered instruction file for this agent. */
  instructionFile: string;
  /** Execution mode (`plan` | `edit`). */
  mode: ExecutionMode;
  /** A reference the agent can use to reach the ClickSmith MCP server. */
  mcpServer: string;
  /** Working directory for the spawned process (the sandbox). */
  cwd: string;
  /** Isolation strategy in effect for this run. */
  isolation: Isolation;
  /** The agent id being launched. */
  agentId: string;
  /**
   * Resolves whether an executable exists on PATH. Injected by the daemon so
   * adapters never have to spawn processes themselves. Defaults to a PATH scan.
   */
  binExists?: (bin: string) => Promise<boolean>;
}

/** A concrete, ready-to-spawn process specification. */
export interface CommandSpec {
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}

/** A normalized event parsed from an agent's stdout/stderr stream. */
export type AgentEvent =
  | { type: 'plan-ready'; plan?: string; diff?: string }
  | { type: 'progress'; message: string }
  | { type: 'error'; message: string };

/**
 * The adapter contract. Built-in adapters are produced from `agents.config.json`
 * by {@link configToAdapter}; the launcher only resolves placeholders. Authors
 * may also hand-write adapters that satisfy this interface.
 */
export interface AgentAdapter {
  id: string;
  /** Whether the agent's CLI is installed/usable in this context. */
  isAvailable(ctx: AgentLaunchContext): Promise<boolean>;
  /** Build the concrete command to spawn. */
  buildCommand(ctx: AgentLaunchContext): CommandSpec;
  /** Optionally map a raw output chunk into structured events. */
  parseEvents?(chunk: string, ctx: AgentLaunchContext): AgentEvent[];
}
