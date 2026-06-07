import { renderInstructionBody, type InstructionTemplateOptions } from './instruction-template.js';
import type { InstructionTarget } from './config-schema.js';

export const MANAGED_BEGIN = '<!-- BEGIN CLICKSMITH (managed — do not edit by hand) -->';
export const MANAGED_END = '<!-- END CLICKSMITH (managed) -->';

export interface RenderedInstruction {
  target: InstructionTarget;
  /** Default relative path for this target's native file. */
  path: string;
  /**
   * `true` when the target file commonly holds other content (e.g. `CLAUDE.md`,
   * `AGENTS.md`). The installer then inserts {@link content} as a managed block
   * rather than overwriting the whole file.
   */
  shared: boolean;
  /** Full file content (dedicated files) or managed-block body (shared files). */
  content: string;
}

/** Wrap a body in the managed-block markers. */
export function wrapManagedBlock(body: string): string {
  return `${MANAGED_BEGIN}\n${body.trim()}\n${MANAGED_END}\n`;
}

/**
 * Insert or replace the ClickSmith managed block within existing file content,
 * preserving everything the user wrote outside the markers.
 */
export function applyManagedBlock(existing: string | undefined, body: string): string {
  const block = wrapManagedBlock(body);
  if (!existing || !existing.trim()) return block;
  const begin = existing.indexOf(MANAGED_BEGIN);
  const end = existing.indexOf(MANAGED_END);
  if (begin !== -1 && end !== -1 && end > begin) {
    const before = existing.slice(0, begin);
    const after = existing.slice(end + MANAGED_END.length);
    return `${before}${block.trimEnd()}${after}`.replace(/\n{3,}/g, '\n\n');
  }
  return `${existing.trimEnd()}\n\n${block}`;
}

function cursorMdc(body: string): string {
  // alwaysApply: false — the agentPrompt carries all context; auto-loading this
  // file as system context makes agents explore instead of act immediately.
  return `---
description: ClickSmith — how to handle captured UI change requests
alwaysApply: false
---

${body.trim()}
`;
}

/** Render the shared instruction body into a target's native file. */
export function renderInstructions(
  target: InstructionTarget,
  options: InstructionTemplateOptions = {},
): RenderedInstruction {
  const body = renderInstructionBody(options);
  switch (target) {
    case 'claude':
      return { target, path: 'CLAUDE.md', shared: true, content: body };
    case 'codex':
      return { target, path: 'AGENTS.md', shared: true, content: body };
    case 'cursor':
      return { target, path: '.cursor/rules/clicksmith.mdc', shared: false, content: cursorMdc(body) };
    case 'antigravity':
      return {
        target,
        path: '.antigravity/rules/clicksmith.md',
        shared: false,
        content: `${body.trim()}\n`,
      };
    case 'generic':
      return {
        target,
        path: '.clicksmith/AGENT_INSTRUCTIONS.md',
        shared: false,
        content: `${body.trim()}\n`,
      };
    default: {
      const _exhaustive: never = target;
      throw new Error(`Unknown instruction target: ${String(_exhaustive)}`);
    }
  }
}

/** Render instruction files for several targets at once. */
export function renderAllInstructions(
  targets: readonly InstructionTarget[],
  options: InstructionTemplateOptions = {},
): RenderedInstruction[] {
  return targets.map((t) => renderInstructions(t, options));
}
