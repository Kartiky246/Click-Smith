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
 * text — so Claude, Cursor, Codex, Antigravity and generic agents all learn the
 * same three things: the `#N` reference system, locator priority, and the
 * plan/worktree safety contract.
 */
export function renderInstructionBody(options: InstructionTemplateOptions = {}): string {
  const tools = options.mcpTools ?? DEFAULT_MCP_TOOLS;
  const attrs = options.stableAttrs ?? [];
  const locatorList = LOCATOR_PRIORITY.map((kind, i) => `${i + 1}. **${kind}**`).join(' → ');

  return `# ClickSmith — working with captured UI requests

You are being asked to change UI elements that a human pointed at in their browser
with ClickSmith. Each request arrives as a **capture bundle** (a JSON file whose
path is provided to you) describing one or more elements and a free-text prompt.

## 1. The \`#N\` reference system

Elements are numbered \`#1\`, \`#2\`, … in the order they were captured. The user's
prompt refers to them by number, e.g. _"make #1 match #2's style"_. Always resolve
\`#N\` to \`elements[]\` entries with the matching \`id\` field. Never guess which
element is meant — read the bundle.

## 2. Locator priority

Each element carries a \`locator\`. Trust them in this exact order, best first:

${locatorList}

- **source** gives an exact \`file:line\` (injected in dev by @clicksmith/unplugin) —
  edit there directly.
- **attr** is a stable attribute${attrs.length ? ` (this project uses: ${attrs.map((a) => `\`${a}\``).join(', ')})` : ''}; grep for it to find the JSX/template.
- **behavioral** is an ARIA role + accessible name; search for the visible text/label.
- **dom** is a structural fallback; use \`el.text\`, \`el.attrs\`, and \`near\` context to
  locate the component, and prefer adding a stable attribute while you're there.

## 3. Plan / worktree safety (read carefully)

ClickSmith runs you inside an **isolated git worktree** by default. The execution
mode is in \`execution.mode\`:

- **plan** (the default): produce a clear plan and, if helpful, a diff — but **do
  not** assume your edits ship. The human reviews your plan/diff and explicitly
  clicks **Apply**. Your job is to propose, precisely.
- **edit**: you may modify files in the sandbox. They still do **not** reach the
  user's main working tree until they click Apply.

Never run destructive git commands, never push, and never touch files outside the
sandbox working directory.

## 4. Reading the request

The bundle path is passed on the command line / via your harness. ${
    tools.length
      ? `You can also use these MCP tools (server \`clicksmith\`): ${tools
          .map((t) => `\`${t}\``)
          .join(', ')}. Use \`get_latest_request\` to fetch the most recent submission, then \`get_element_by_id\` to resolve a specific \`#N\`.`
      : ''
}

Each element includes: \`locator\`, \`el\` (tag/text/role/label/attrs/icon hints),
\`near\` (surrounding labels & headings), \`conditions\` (viewport/theme), and an
optional \`screenshot\` thumbnail. Use \`near\` and \`app.route\` to disambiguate when
multiple elements look similar.
${options.daemonPort ? `\nThe ClickSmith daemon is at http://127.0.0.1:${options.daemonPort}.\n` : ''}`;
}
