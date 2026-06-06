import {
  PLACEHOLDER_KEYS,
  type AgentLaunchContext,
  type CommandSpec,
  type PlaceholderKey,
} from './types.js';
import type { AgentConfig } from './config-schema.js';

/** Build the placeholder → value map from a launch context. */
export function placeholderValues(ctx: AgentLaunchContext): Record<PlaceholderKey, string> {
  return {
    bundlePath: ctx.bundlePath,
    prompt: ctx.prompt,
    agentPrompt: ctx.agentPrompt,
    instructionFile: ctx.instructionFile,
    mode: ctx.mode,
    mcpServer: ctx.mcpServer,
    cwd: ctx.cwd,
  };
}

const PLACEHOLDER_RE = /\{([a-zA-Z]+)\}/g;

/**
 * Replace every known `{placeholder}` in a template string with its value.
 * Unknown placeholders are left untouched (so literal braces survive). This is
 * the *entire* job of the launcher — no vendor-specific knowledge lives here.
 */
export function resolvePlaceholders(template: string, ctx: AgentLaunchContext): string {
  const values = placeholderValues(ctx);
  return template.replace(PLACEHOLDER_RE, (match, key: string) => {
    return key in values ? values[key as PlaceholderKey] : match;
  });
}

/** Resolve an entire {@link AgentConfig} into a concrete {@link CommandSpec}. */
export function resolveCommand(config: AgentConfig, ctx: AgentLaunchContext): CommandSpec {
  const env = config.env
    ? Object.fromEntries(
        Object.entries(config.env).map(([k, v]) => [k, resolvePlaceholders(v, ctx)]),
      )
    : undefined;
  return {
    command: resolvePlaceholders(config.command, ctx),
    args: config.args.map((a) => resolvePlaceholders(a, ctx)),
    cwd: config.cwd ? resolvePlaceholders(config.cwd, ctx) : ctx.cwd,
    ...(env ? { env } : {}),
  };
}

/** List the placeholders actually referenced by a template string. */
export function referencedPlaceholders(template: string): PlaceholderKey[] {
  const found = new Set<PlaceholderKey>();
  for (const m of template.matchAll(PLACEHOLDER_RE)) {
    const key = m[1] as string;
    if ((PLACEHOLDER_KEYS as readonly string[]).includes(key)) {
      found.add(key as PlaceholderKey);
    }
  }
  return [...found];
}
