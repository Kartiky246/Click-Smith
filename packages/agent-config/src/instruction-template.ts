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

**The user message already contains the exact file path and the change to make.**

- The target file is already identified — skip repo-wide search.
- Run the listed grep(s) (≤ 2) to locate the exact line, then edit only that file.
- Apply this project's existing conventions and design rules to the edit.
- Do not open unrelated files, packages, or directories.${
    attrs.length ? `\n- Project stable attrs: ${attrs.join(', ')}.` : ''
  }`;
}
