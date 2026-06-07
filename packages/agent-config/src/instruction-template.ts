import { LOCATOR_PRIORITY } from '@clicksmith/core';

export interface InstructionTemplateOptions {
  /** MCP tool names exposed by the daemon. */
  mcpTools?: readonly string[];
  /** The daemon port, for the agent's reference. */
  daemonPort?: number;
  /** Project-specific stable attributes the project relies on (e.g. data-testid). */
  stableAttrs?: readonly string[];
}

export const DEFAULT_MCP_TOOLS = [
  'get_session',
  'list_elements',
  'get_element_by_id',
  'get_latest_request',
] as const;

/**
 * The single, shared instruction body. Every native renderer wraps this exact
 * text so Claude, Cursor, Codex, Antigravity and generic agents all receive the
 * same compact fast-path contract.
 */
export function renderInstructionBody(options: InstructionTemplateOptions = {}): string {
  const attrs = options.stableAttrs ?? [];

  return `# ClickSmith

**The user message already contains the exact file location and the change to make.**

Execute ONLY the "Immediate actions" listed in the user message. Do NOT read AGENTS.md, CLAUDE.md, .cursor/rules, guidelines, skills, or any other project docs. Do NOT use MCP tools, list resources, or explore the repo. Run the listed grep (≤ 2), edit the one matching file, done.${
    attrs.length ? `\n\nProject stable attrs: ${attrs.join(', ')}.` : ''
  }`;
}
