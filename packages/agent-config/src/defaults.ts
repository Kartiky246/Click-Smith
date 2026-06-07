import type { AgentConfig, AgentsConfig } from './config-schema.js';

/**
 * Built-in agent templates. **These are example defaults — data, not launcher
 * logic.** Changing a vendor's CLI flag means editing `agents.config.json`
 * (or these defaults), never the daemon. The launcher only resolves the
 * `{placeholders}` below; it has no idea what `claude` or `codex` actually do.
 */
export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    command: 'claude',
    args: ['-p', '{agentPrompt}', '--append-system-prompt', '@{instructionFile}'],
    detect: { anyOf: ['claude'] },
    instructions: { target: 'claude', file: 'CLAUDE.md' },
    mcp: { register: 'claude' },
    parse: { planReady: 'plan ready|here is the plan|## plan', error: '^error:|fatal:' },
  },
  {
    id: 'cursor',
    label: 'Cursor Agent',
    command: 'cursor-agent',
    args: ['--print', '{agentPrompt}'],
    detect: { anyOf: ['cursor-agent', 'cursor'] },
    instructions: { target: 'cursor', file: '.cursor/rules/clicksmith.mdc' },
    mcp: { register: 'cursor' },
  },
  {
    id: 'codex',
    label: 'OpenAI Codex',
    command: 'codex',
    args: [
      'exec',
      '--cd',
      '{cwd}',
      '--sandbox',
      'workspace-write',
      '--skip-git-repo-check',
      '--ephemeral',
      '-c',
      'model_reasoning_effort="low"',
      '{agentPrompt}',
    ],
    detect: { anyOf: ['codex'] },
    instructions: { target: 'codex', file: 'AGENTS.md' },
    mcp: { register: 'codex' },
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    command: 'antigravity',
    args: ['run', '--prompt', '{agentPrompt}'],
    detect: { anyOf: ['antigravity'] },
    instructions: { target: 'antigravity', file: '.antigravity/rules/clicksmith.md' },
    mcp: { register: 'mcp-json' },
  },
  {
    id: 'generic',
    label: 'Generic agent (customize me)',
    command: 'sh',
    args: [
      '-c',
      'echo "ClickSmith request: {prompt}"; echo "Bundle: {bundlePath}"; echo "Instructions: {instructionFile}"; echo "Mode: {mode}"; echo "Prompt: {agentPrompt}"',
    ],
    instructions: { target: 'generic', file: '.clicksmith/AGENT_INSTRUCTIONS.md' },
    mcp: { register: 'mcp-json' },
  },
];

/** The full default `agents.config.json` document. */
export const DEFAULT_AGENTS_CONFIG: AgentsConfig = {
  version: 1,
  defaultAgent: 'claude',
  agents: DEFAULT_AGENTS,
};
