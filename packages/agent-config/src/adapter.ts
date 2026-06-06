import { defaultBinExists } from './bin-exists.js';
import { resolveCommand } from './placeholders.js';
import type { AgentConfig } from './config-schema.js';
import type { AgentAdapter, AgentEvent, AgentLaunchContext } from './types.js';

/**
 * Turn a config entry into a live {@link AgentAdapter}. This is the bridge that
 * lets *data* (`agents.config.json`) behave like a built-in adapter:
 *
 * - `isAvailable` checks the configured `detect.anyOf` executables on PATH.
 * - `buildCommand` resolves placeholders into a concrete command.
 * - `parseEvents` applies the optional regexes from `config.parse`.
 */
export function configToAdapter(config: AgentConfig): AgentAdapter {
  const planRe = config.parse?.planReady ? new RegExp(config.parse.planReady, 'i') : undefined;
  const errRe = config.parse?.error ? new RegExp(config.parse.error, 'i') : undefined;

  return {
    id: config.id,

    async isAvailable(ctx: AgentLaunchContext): Promise<boolean> {
      const bins = config.detect?.anyOf ?? [config.command];
      const exists = ctx.binExists ?? defaultBinExists;
      for (const bin of bins) {
        if (await exists(bin)) return true;
      }
      return false;
    },

    buildCommand(ctx: AgentLaunchContext) {
      return resolveCommand(config, ctx);
    },

    parseEvents(chunk: string): AgentEvent[] {
      if (!planRe && !errRe) return [];
      const events: AgentEvent[] = [];
      for (const line of chunk.split(/\r?\n/)) {
        if (!line.trim()) continue;
        if (errRe?.test(line)) events.push({ type: 'error', message: line.trim() });
        else if (planRe?.test(line)) events.push({ type: 'plan-ready' });
      }
      return events;
    },
  };
}

/** Build adapters for every agent in a config, keyed by id. */
export function buildAdapters(configs: readonly AgentConfig[]): Map<string, AgentAdapter> {
  const map = new Map<string, AgentAdapter>();
  for (const config of configs) {
    map.set(config.id, configToAdapter(config));
  }
  return map;
}
