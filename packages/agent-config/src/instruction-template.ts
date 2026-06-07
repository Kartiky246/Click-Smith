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
  const tools = options.mcpTools ?? DEFAULT_MCP_TOOLS;
  const attrs = options.stableAttrs ?? [];
  const locatorList = LOCATOR_PRIORITY.map((kind, i) => `${i + 1}. ${kind}`).join(' -> ');

  return `# ClickSmith fast UI edits

ClickSmith sends a small browser-capture summary for UI changes. The prompt
already contains all context needed — do NOT explore the repo broadly.

Fast path (do exactly these steps, in order):

1. Read the target summary in the prompt. \`#N\` refers to the captured element.
2. Locator order: ${locatorList}.
   - **source**: open only that file at the given line. No grep needed.
   - **attr**: \`git grep -n -e 'value' -- .\` for the stable attribute${attrs.length ? ` (project attrs: ${attrs.join(', ')})` : ''}.
   - **behavioral**: grep for the accessible name or label text.
   - **dom**: grep for searchTokens or nearby text.
3. Run the grep commands given in the prompt. Stop after at most two searches.
4. Edit the smallest file that contains the component usage.

Do NOT:
- Read AGENTS.md, CLAUDE.md, .cursor/rules, guidelines, skills, or any docs.
- Attempt to connect to an HTTP server or daemon.
- Edit shared sprite/icon definitions unless the request explicitly asks.
- Explore the repo broadly before doing the targeted grep.

Keep edits minimal, non-destructive, and inside the current working directory.
In worktree/branch isolation ClickSmith applies changes later; in inplace mode
edits affect the working tree immediately.${
    tools.length
      ? `\n\nMCP last resort only: if the targeted grep yields nothing, the \`clicksmith\` server exposes: ${tools
          .map((t) => `\`${t}\``)
          .join(', ')}.`
      : ''
}`;
}
