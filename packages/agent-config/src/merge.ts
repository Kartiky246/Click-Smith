import type { AgentConfig, AgentsConfig } from './config-schema.js';

/**
 * Layer agent configs: shipped defaults → project config → user config. Agents
 * with the same `id` are replaced by later layers; new ids are appended in
 * order. `defaultAgent` from the last layer that sets it wins.
 */
export function mergeAgentsConfig(base: AgentsConfig, ...overlays: AgentsConfig[]): AgentsConfig {
  let agents = [...base.agents];
  let defaultAgent = base.defaultAgent;

  for (const overlay of overlays) {
    agents = mergeAgentList(agents, overlay.agents);
    if (overlay.defaultAgent) defaultAgent = overlay.defaultAgent;
  }

  return {
    version: 1,
    ...(defaultAgent ? { defaultAgent } : {}),
    agents,
  };
}

function mergeAgentList(base: AgentConfig[], overlay: AgentConfig[]): AgentConfig[] {
  const byId = new Map(base.map((a) => [a.id, a]));
  const order = base.map((a) => a.id);
  for (const agent of overlay) {
    if (!byId.has(agent.id)) order.push(agent.id);
    byId.set(agent.id, agent);
  }
  return order.map((id) => byId.get(id)!);
}

/** Resolve the effective agent for a run: explicit id → defaultAgent → first. */
export function resolveAgent(config: AgentsConfig, agentId?: string): AgentConfig | undefined {
  if (agentId) return config.agents.find((a) => a.id === agentId);
  if (config.defaultAgent) {
    const found = config.agents.find((a) => a.id === config.defaultAgent);
    if (found) return found;
  }
  return config.agents[0];
}
