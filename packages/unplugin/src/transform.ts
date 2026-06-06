import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import MagicString from 'magic-string';
import type { JSXOpeningElement } from '@babel/types';

// @babel/traverse ships a CJS default export; normalize for ESM consumers.
const traverse = (
  typeof _traverse === 'function' ? _traverse : (_traverse as { default: typeof _traverse }).default
) as typeof _traverse;

export interface InjectOptions {
  /** The (preferably project-relative) file path encoded into `data-loc`. */
  file: string;
  /** The attribute name to inject. Default `data-loc`. */
  attribute?: string;
}

export interface InjectResult {
  code: string;
  map: ReturnType<MagicString['generateMap']>;
  /** How many opening elements received the attribute. */
  injected: number;
}

/**
 * Inject a `data-loc="file:line:column"` attribute onto every JSX opening
 * element that does not already have one. Returns `null` when the source can't
 * be parsed or there is nothing to inject (so the caller falls back to leaving
 * the file untouched). Pure and idempotent: running it twice never adds a
 * duplicate attribute.
 */
export function injectDataLoc(code: string, options: InjectOptions): InjectResult | null {
  const attribute = options.attribute ?? 'data-loc';

  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: false,
    });
  } catch {
    // Sourceless fallback: unparseable input is left untouched. The runtime
    // locator pipeline (attr → behavioral → dom) still works without data-loc.
    return null;
  }

  const s = new MagicString(code);
  let injected = 0;

  traverse(ast, {
    JSXOpeningElement(path) {
      const node = path.node as JSXOpeningElement;
      if (isFragment(node) || hasAttribute(node, attribute)) return;
      const loc = node.loc?.start;
      const insertAt = node.name.end;
      if (loc == null || insertAt == null) return;
      const value = `${options.file}:${loc.line}:${loc.column}`;
      s.appendLeft(insertAt, ` ${attribute}="${escapeAttr(value)}"`);
      injected++;
    },
  });

  if (injected === 0) return null;
  return { code: s.toString(), map: s.generateMap({ hires: true }), injected };
}

function isFragment(node: JSXOpeningElement): boolean {
  return node.name.type === 'JSXIdentifier' && node.name.name === 'Fragment';
}

function hasAttribute(node: JSXOpeningElement, attribute: string): boolean {
  return node.attributes.some(
    (attr) => attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier' && attr.name.name === attribute,
  );
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}
